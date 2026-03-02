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

HOST_WS = None
CLIENTS: set[ServerConnection] = set()

async def handler(ws: ServerConnection, path=None):
    global HOST_WS, CLIENTS
    peer = ws.remote_address
    logging.info(f'Connection from {peer}')
    role = None
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
                    HOST_WS = ws
                    logging.info('Registered host: %s nick=%s', peer, ws.nick)
                else:
                    CLIENTS.add(ws)
                    logging.info('Registered client: %s nick=%s (clients=%d)', peer, ws.nick, len(CLIENTS))
                # broadcast updated peer list
                await broadcast_peers()
                continue

            if mtype == 'request_state':
                # forward to host if present
                if HOST_WS and HOST_WS.state == State.OPEN:
                    await HOST_WS.send(json.dumps({'type':'request_state'}))
                continue

            if mtype == 'identity':
                # update nickname/color for this ws and broadcast
                ws.nick = msg.get('nick')
                ws.color = msg.get('color')
                logging.info('Updated identity for %s -> nick=%s', peer, ws.nick)
                await broadcast_peers()
                continue

            if mtype == 'control':
                # route depending on sender
                if ws is HOST_WS:
                    # broadcast to all clients
                    data = json.dumps(msg)
                    coros = [c.send(data) for c in list(CLIENTS) if c.state == State.OPEN]
                    if coros:
                        await asyncio.gather(*coros, return_exceptions=True)
                else:
                    # forward to host
                    if HOST_WS and HOST_WS.state == State.OPEN:
                        await HOST_WS.send(json.dumps(msg))
                    else:
                        logging.warning('Client sent control message but no host is connected')
                continue

            if mtype == 'full_state':
                # host sends full state -> broadcast to clients
                if ws is HOST_WS:
                    data = json.dumps(msg)
                    coros = [c.send(data) for c in list(CLIENTS) if c.state == State.OPEN]
                    if coros:
                        await asyncio.gather(*coros, return_exceptions=True)
                continue

            # Unknown message types: forward to host by default
            if HOST_WS and HOST_WS.state == State.OPEN and ws is not HOST_WS:
                await HOST_WS.send(json.dumps(msg))

    except Exception as e:
        logging.info('Connection closed %s: %s', peer, e)
    finally:
        # cleanup
        if ws is HOST_WS:
            logging.info('Host disconnected')
            HOST_WS = None
        if ws in CLIENTS:
            CLIENTS.remove(ws)
            logging.info('Client disconnected: %s (clients=%d)', peer, len(CLIENTS))
        # broadcast updated peers after disconnect
        try:
            await broadcast_peers()
        except Exception:
            pass


async def broadcast_peers():
    # build list of peers with role/nick/color
    logging.info('Broadcasting peer list update')
    peers = []
    if HOST_WS and getattr(HOST_WS, 'state', None) == State.OPEN:
        peers.append({'role':'host', 'nick': getattr(HOST_WS, 'nick', None), 'color': getattr(HOST_WS, 'color', None)})
    for c in list(CLIENTS):
        if getattr(c, 'state', None) == State.OPEN:
            peers.append({'role':'client', 'nick': getattr(c, 'nick', None), 'color': getattr(c, 'color', None)})
    data = json.dumps({'type':'peers', 'peers': peers})
    targets = [s for s in ([HOST_WS] if HOST_WS else []) + list(CLIENTS) if s and getattr(s, 'state', None) == State.OPEN]
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
