# zoom-L20-control
Simple WebApp to control Zoom L20 mixers over BLE

## Usage
1. Clone the repository
1. Open `index.html` in a web browser
1. Connect to the mixer over Bluetooth and control it using the web interface
1. (Optional) Connect additional clients to the websocket server to control the mixer from multiple devices simultaneously
    1. Install python dependencies: `pip install -r requirements.txt`
    1. Run the websocket server: `python websocket_server.py`
    1. Connect the host and clients to the websocket server

## Disclaimer
This project was absolutely vibe-coded and might not be safe or efficient. Use at your own risk.

## Todos
- [X] Implement Zoom L-20 SysEx messages: Done!
  - [X] Fetch all parameters
  - [X] Real time peak meter values
  - [X] Channel strip names and colors

- [ ] Presets
- [ ] Mapped fader dB values
- [ ] More channel strip controls (pan, mute, solo, record/playback, fx, etc.)
- [ ] Send peaks to websocket clients
- [ ] Send strip styling to websocket clients
- [ ] Recorder UI
