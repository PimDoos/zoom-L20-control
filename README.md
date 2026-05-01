# zoom-L20-control
Simple WebApp to control Zoom L20 mixers over BLE

## Usage

### Standalone

1. Clone the repository
1. Open `index.html` in a web browser
1. Connect to the mixer over Bluetooth and control it using the web interface

### Multiple users
1. Clone the repository
1. Run the webserver and websocket server
  1. Either run it manually by running the `ws/websocker_server.py` and serving `www` with a webserver (HTTPS required for Bluetooth to work)
  1. Or run the project with Docker using `docker compose up`
1. The websocket server uses the path as a unique room identifier. To join a room, use the same WebSocket URL on all clients.


## Disclaimer
This project was absolutely vibe-coded and might not be safe or efficient. Use at your own risk.

## Todos
- [X] Implement Zoom L-20 SysEx messages: Done!
  - [X] Fetch all parameters
  - [X] Real time peak meter values
  - [X] Channel strip names and colors

- [ ] Presets
- [X] Mapped fader dB values
- [X] More channel strip controls (pan, mute, solo, record/playback, fx, etc.)
- [ ] Send peaks to websocket clients
- [X] Send strip styling to websocket clients
- [ ] Recorder
  - [X] UI
  - [ ] Find button SysEx commands
- [X] Add channel strip inspector (for EQ, PAN, FX, change color/name)
- [ ] Disable controls if not connected to Bluetooth or WebSocket
- [ ] Show one bus at a time, with tabs to switch between
