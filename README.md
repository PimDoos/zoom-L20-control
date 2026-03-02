# zoom-L20-control
Simple WebApp to control Zoom L20 mixers over BLE

## Usage
1. Clone the repository
2. Install python dependencies: `pip install -r requirements.txt`
3. Run the websocket server: `python websocket_server.py`
4. Open `index.html` in a web browser
5. Connect to the mixer and control it using the web interface
6. (Optional) Connect additional clients to the websocket server to control the mixer from multiple devices simultaneously

## Disclaimer
This project was absolutely vibe-coded and might not be safe or efficient. Use at your own risk.

## Todos
- [ ] Implement Zoom L-20 SysEx messages
  - [ ] Fetch all parameters
  - [ ] Real time peak meter values
  - [ ] Channel strip names and colors

- [ ] Presets
- [ ] Mapped fader dB values
- [ ] More channel strip controls (pan, mute, solo, record/playback, fx, etc.)
