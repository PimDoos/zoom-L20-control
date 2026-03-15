#!/usr/bin/env python3
"""
Simple WebSocket relay server for L20 control synchronization.
- One host connects and identifies with {"type":"role","role":"host"}
- Clients connect and identify with {"type":"role","role":"client"}
- Host -> server broadcasts {"type":"control","id":...,"value":...} to all clients
- Client -> server forwards control messages to host
- Clients may send {"type":"request_state"} to ask host for current state
- Host may send {"type":"full_state","state":{...}} to update clients

Usage: python websocket_server.py --host 0.0.0.0 --port 8765
"""
import asyncio
import json
import logging
import argparse
from websockets import State, serve, ServerConnection

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# map path -> host websocket
ROOM_HOSTS: dict[str, ServerConnection] = {}
# map path -> set of client websockets
ROOM_CLIENTS: dict[str, set[ServerConnection]] = {}

async def handler(ws: ServerConnection, path=None):
    global HOST_WS, CLIENTS
    peer = ws.remote_address
    logging.info(f'Connection from {peer}')
    role = None
    # determine room from path (use '/' for root/None)
    room = ws.request.path or '/'
    ws.room = room
    # attach default metadata
    ws.nick = None
    ws.color = None
    try:
        # Expect a role message first (but allow other flows)
        async for message in ws:
            try:
                msg = json.loads(message)
            except Exception as e:
                logging.warning('Invalid JSON from %s: %s', peer, e)
                continue

            mtype = msg.get('type')

            if mtype == 'role':
                role = msg.get('role')
                ws.role = role
                ws.nick = msg.get('nick')
                ws.color = msg.get('color')
                if role == 'host':
                    prev = ROOM_HOSTS.get(room)
                    if prev is not None and getattr(prev, 'state', None) == State.OPEN:
                        logging.info('Replacing existing host in room %s', room)
                    ROOM_HOSTS[room] = ws
                    logging.info('Registered host: %s nick=%s room=%s', peer, ws.nick, room)
                else:
                    ROOM_CLIENTS.setdefault(room, set()).add(ws)
                    logging.info('Registered client: %s nick=%s room=%s (clients=%d)', peer, ws.nick, room, len(ROOM_CLIENTS.get(room, [])))
                # broadcast updated peer list for this room
                await broadcast_peers(room)
                continue

            elif mtype == 'request_state':
                # forward to host in same room if present
                host = ROOM_HOSTS.get(ws.room)
                if host and getattr(host, 'state', None) == State.OPEN:
                    await host.send(json.dumps({'type':'request_state'}))
                continue

            elif mtype == 'identity':
                # update nickname/color for this ws and broadcast to room
                ws.nick = msg.get('nick')
                ws.color = msg.get('color')
                logging.info('Updated identity for %s -> nick=%s room=%s', peer, ws.nick, ws.room)
                await broadcast_peers(ws.room)
                continue

            elif mtype == 'control':
                # route depending on sender within the room
                host = ROOM_HOSTS.get(ws.room)
                if ws is host:
                    # broadcast to all clients in this room
                    data = json.dumps(msg)
                    clients = ROOM_CLIENTS.get(ws.room, set())
                    coros = [c.send(data) for c in list(clients) if getattr(c, 'state', None) == State.OPEN]
                    if coros:
                        await asyncio.gather(*coros, return_exceptions=True)
                else:
                    # forward to host
                    if host and getattr(host, 'state', None) == State.OPEN:
                        await host.send(json.dumps(msg))
                    else:
                        logging.warning('Client sent control message but no host is connected in room %s', ws.room)
                continue

            elif mtype == 'full_state':
                # host sends full state -> broadcast to clients in same room
                host = ROOM_HOSTS.get(ws.room)
                if ws is host:
                    data = json.dumps(msg)
                    clients = ROOM_CLIENTS.get(ws.room, set())
                    coros = [c.send(data) for c in list(clients) if getattr(c, 'state', None) == State.OPEN]
                    if coros:
                        await asyncio.gather(*coros, return_exceptions=True)
                continue

            # Unknown message types: forward to host in same room by default
            elif ROOM_HOSTS.get(ws.room) and getattr(ROOM_HOSTS[ws.room], 'state', None) == State.OPEN and ws is not ROOM_HOSTS[ws.room]:
                await ROOM_HOSTS[ws.room].send(json.dumps(msg))

    except Exception as e:
        logging.info('Connection closed %s: %s', peer, e)
    finally:
        # cleanup by room
        r = getattr(ws, 'room', None)
        if r:
            host = ROOM_HOSTS.get(r)
            if ws is host:
                logging.info('Host disconnected from room %s', r)
                ROOM_HOSTS.pop(r, None)
            clients = ROOM_CLIENTS.get(r)
            if clients and ws in clients:
                clients.remove(ws)
                logging.info('Client disconnected: %s room=%s (clients=%d)', peer, r, len(clients))
                if not clients:
                    ROOM_CLIENTS.pop(r, None)
        # broadcast updated peers for the room after disconnect
        try:
            if r:
                await broadcast_peers(r)
        except Exception:
            pass


async def broadcast_peers(room: str):
    # build list of peers with role/nick/color for a specific room
    logging.info('Broadcasting peer list update for room %s', room)
    peers = []
    host = ROOM_HOSTS.get(room)
    if host and getattr(host, 'state', None) == State.OPEN:
        peers.append({'role':'host', 'nick': getattr(host, 'nick', None), 'color': getattr(host, 'color', None)})
    for c in list(ROOM_CLIENTS.get(room, set())):
        if getattr(c, 'state', None) == State.OPEN:
            peers.append({'role':'client', 'nick': getattr(c, 'nick', None), 'color': getattr(c, 'color', None)})
    data = json.dumps({'type':'peers', 'peers': peers})
    targets = []
    if host and getattr(host, 'state', None) == State.OPEN:
        targets.append(host)
    targets.extend([c for c in list(ROOM_CLIENTS.get(room, set())) if getattr(c, 'state', None) == State.OPEN])
    if targets:
        await asyncio.gather(*[t.send(data) for t in targets], return_exceptions=True)

async def main(host: str, port: int):
    async with serve(handler, host, port):
        logging.info('WebSocket server listening on %s:%d', host, port)
        await asyncio.Future()  # run forever


p = argparse.ArgumentParser()
p.add_argument('--host', default='0.0.0.0')
p.add_argument('--port', type=int, default=8765)
args = p.parse_args()
try:
    asyncio.run(main(args.host, args.port))
except KeyboardInterrupt:
    logging.info('Server stopped')
