const MIDI_SERVICE_UID            = '03B80E5A-EDE8-4B33-A751-6CE34EC4C700'.toLowerCase();
const MIDI_IO_CHARACTERISTIC_UID  = '7772E5DB-3868-4112-A1A9-F2669D106BF3'.toLowerCase();

var app = {
    elements:{
        connectButton: document.getElementById("connect"),
        disconnectButton: document.getElementById("disconnect"),
        log: document.getElementById("log"),
        statusWs: document.getElementById("status_ws"),
        statusBle: document.getElementById("status_ble"),
        ws_url: document.getElementById("ws_url"),
        nick: document.getElementById("nick"),
        color: document.getElementById("color"),
        peers: document.getElementById("peers"),
        bus_faders: document.getElementById("bus_faders"),
        master_faders: document.getElementById("master_faders"),
        monitor_a_faders: document.getElementById("monitor_a_faders"),
        monitor_b_faders: document.getElementById("monitor_b_faders"),
        monitor_c_faders: document.getElementById("monitor_c_faders"),
        monitor_d_faders: document.getElementById("monitor_d_faders"),
        monitor_e_faders: document.getElementById("monitor_e_faders"),
        monitor_f_faders: document.getElementById("monitor_f_faders"),
        efx_faders: document.getElementById("efx_faders"),
    },
    midi: {},
    map: {},
};

app.log = function(message){
    var log = app.elements.log;
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
}

app.setStatus = function(kind, text){
    if(!app.elements) return;
    if(kind === 'ws' && app.elements.statusWs) app.elements.statusWs.textContent = text;
    if(kind === 'ble' && app.elements.statusBle) app.elements.statusBle.textContent = text;
}

// WebSocket networking helpers
app.ws = null;
app.role = 'client';
app.wsUrl = '';
app.nick = '';
app.color = '#00aaff';

app.sendWs = function(obj){
    if(!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
    try{
        app.ws.send(JSON.stringify(obj));
    } catch(e){
        app.log('WS send error: ' + e);
    }
}

app.handleWsMessage = function(evt){
    try{
        const msg = JSON.parse(evt.data);
        if(msg.type === 'control'){
            const control = getControlById(msg.id);
            if(control){
                control_values[msg.id] = msg.value;
                const el = document.querySelector(`[data-control-id="${msg.id}"]`);
                if(el && !el.matches(':active')) el.value = msg.value;

                if(app.role === 'host'){
                    // If host, also write to BLE
                    if(app.midi && app.midi.characteristic){
                        midiMessageData = new Uint8Array([180,180,MIDI_STATUS.control_change | (control.ch - 1), control.cc, Number(msg.value)])
                        app.midi.characteristic.writeValue(midiMessageData);
                        app.log(`Set ${control.name} to ${msg.value} (from client)`);
                    } else {
                        app.log(`No MIDI characteristic available to write ${control.name} (from client)`);
                    }
                } else {
                    app.log(`Set ${control.name} to ${msg.value} (from host)`);
                }
            }
        } else if(msg.type === 'full_state'){
            // apply full state
            for(const id in msg.state){
                control_values[id] = msg.state[id];
                const el = document.querySelector(`[data-control-id="${id}"]`);
                if(el) el.value = msg.state[id];
            }
        } else if(msg.type === 'peers'){
            if(Array.isArray(msg.peers)){
                app.updatePeersUI(msg.peers);
            }
        }
    } catch(e){
        app.log('WS message parse error: ' + e);
    }
}

app.joinNetwork = function(){
    const urlInput = document.getElementById('ws_url');
    const roleSelect = document.getElementById('role');
    if(!urlInput || !roleSelect) return;
    app.wsUrl = urlInput.value;
    app.role = roleSelect.value;
    app.setStatus('ws', 'connecting');

    try{
        app.ws = new WebSocket(app.wsUrl);
        app.ws.addEventListener('open', () => {
            app.setStatus('ws', 'connected');
            app.log('WebSocket connected to ' + app.wsUrl + ' as ' + app.role);
            app.sendWs({type:'role', role: app.role, nick: app.nick, color: app.color});
            // If client, request state
            if(app.role === 'client'){
                app.sendWs({type:'request_state'});
            }
        });
        app.ws.addEventListener('message', app.handleWsMessage);
        app.ws.addEventListener('close', () => { app.setStatus('ws','disconnected'); app.log('WebSocket closed'); });
        app.ws.addEventListener('error', (e) => { app.setStatus('ws','error'); app.log('WebSocket error'); });
    } catch(e){
        app.setStatus('ws','error');
        app.log('WebSocket connect error: ' + e);
    }
}
app.load = function(){
    
    for(let bus = 0; bus <= 6; bus++){
        let bus_id = BUS_NAMES[bus].toLowerCase().replace(" ", "_");
        let control_id = `${bus_id}_level`;
        let control = getControlById(control_id);

        let container = document.createElement("div");
        container.classList.add("channel-strip","bus");

        let element = createControlElement(control_id);

        let label = document.createElement("label");
        label.textContent = control.name.replace(" Level", "");
        label.htmlFor = element.id;
        container.appendChild(label);
        container.appendChild(element);

        app.elements.bus_faders.appendChild(container);

        for(let strip = 1; strip <= 19; strip++){
            if(strip == 18) continue; // Skip 18, which is the right channel of the stereo pair with 17
            let control_id = `${bus_id}_channel_${strip}_level`;
            let control = getControlById(control_id);

            let container = document.createElement("div");
            container.classList.add("channel-strip");

            let element = createControlElement(control_id);

            let label = document.createElement("label");
            label.textContent = strip;
            label.htmlFor = element.id;
            container.appendChild(label);
            container.appendChild(element);

            let faders_container = app.elements[`${bus_id}_faders`];
            if(faders_container){
                faders_container.appendChild(container);
            }
        }
    }

    

    // Wire network join button
    const joinBtn = document.getElementById('join_ws');
    if(joinBtn) joinBtn.addEventListener('click', app.joinNetwork);

    // Load persistent settings from localStorage and wire identity change events
    try{
        const savedUrl = localStorage.getItem('ws_url');
        const savedNick = localStorage.getItem('nick');
        const savedColor = localStorage.getItem('color');
        if(app.elements.ws_url && savedUrl) app.elements.ws_url.value = savedUrl;
        if(app.elements.nick && savedNick){ app.elements.nick.value = savedNick; app.nick = savedNick; }
        if(app.elements.color && savedColor){ app.elements.color.value = savedColor; app.color = savedColor; }
    }catch(e){ }

    if(app.elements.ws_url){
        app.elements.ws_url.addEventListener('change', (e)=>{ try{ localStorage.setItem('ws_url', e.target.value); }catch(_){} });
    }
    if(app.elements.nick){
        app.elements.nick.addEventListener('change', (e)=>{
            app.nick = e.target.value;
            try{ localStorage.setItem('nick', app.nick); }catch(_){}
            if(app.ws && app.ws.readyState === WebSocket.OPEN) app.sendWs({type:'identity', nick: app.nick, color: app.color});
        });
    }
    if(app.elements.color){
        app.elements.color.addEventListener('change', (e)=>{
            app.color = e.target.value;
            try{ localStorage.setItem('color', app.color); }catch(_){}
            if(app.ws && app.ws.readyState === WebSocket.OPEN) app.sendWs({type:'identity', nick: app.nick, color: app.color});
        });
    }

    // Helper to update peers list UI
    app.updatePeersUI = function(peers){
        if(!app.elements.peers) return;
        app.elements.peers.innerHTML = '';
        peers.forEach(p => {
            const item = document.createElement('div');
            item.style.display = 'inline-block';
            item.style.marginRight = '8px';
            const dot = document.createElement('span');
            dot.style.display = 'inline-block';
            dot.style.width = '12px';
            dot.style.height = '12px';
            dot.style.borderRadius = '6px';
            dot.style.background = p.color || '#999';
            dot.style.marginRight = '4px';
            item.appendChild(dot);
            const text = document.createElement('span');
            text.textContent = (p.nick || 'unnamed') + (p.role ? ` (${p.role})` : '');
            item.appendChild(text);
            app.elements.peers.appendChild(item);
        });
    }

    app.log("App loaded");
}

app.connect = function(){
    app.log("Connecting...");
    app.setStatus('ble','connecting');

    // Connect to BLE Midi device (with MIDI service UUID)
    navigator.bluetooth.requestDevice({
        filters: [{ services: [
            MIDI_SERVICE_UID
        ] }]
    })
    .then(device => {
        app.log("Device found: " + device.name);
        return device.gatt.connect();
    })
    .then(server => {
        app.log("Connected to GATT server");
        return server.getPrimaryService(MIDI_SERVICE_UID);
    })
    .then(service => {
        app.log("MIDI service found");
        return service.getCharacteristic(MIDI_IO_CHARACTERISTIC_UID);
    })
    .then(characteristic => {
        app.log("MIDI characteristic found");
        app.midi.characteristic = characteristic;
        return characteristic.startNotifications();
    })
    .then(() => {
        app.log("Notifications started");
        app.midi.characteristic.addEventListener('characteristicvaluechanged', app.handleMidiMessage);
        app.setStatus('ble','connected');
    })
    .catch(error => {
        app.log("Error: " + error);
        app.setStatus('ble','error');
    });
}
app.elements.connectButton.addEventListener('click', app.connect);

app.disconnect = function(){
    const c = app.midi && app.midi.characteristic;
    if(c){
        try{ c.stopNotifications(); }catch(e){}
        try{ c.removeEventListener('characteristicvaluechanged', app.handleMidiMessage); }catch(e){}
        try{ c.service.device.gatt.disconnect(); }catch(e){}
        app.log("Disconnected");
        app.setStatus('ble','disconnected');
    } else {
        app.log("No device connected");
        app.setStatus('ble','disconnected');
    }
}
app.elements.disconnectButton.addEventListener('click', app.disconnect);

app.handleMidiMessage = function(event){
    let value = event.target.value;
    // Process MIDI message (this is just a placeholder)
    let midiData = new Uint8Array(value.buffer);
    let midiMessageData = [];
    let timeStampHeader = midiData[0];
    console.log(midiData);
    
    for(let i = 1; i < midiData.length; i+=4){
        midiMessageData.push([]);
        midiMessageData[midiMessageData.length - 1].push(midiData[i+1]);
        midiMessageData[midiMessageData.length - 1].push(midiData[i+2]);
        midiMessageData[midiMessageData.length - 1].push(midiData[i+3]);
    }
    for(let i = 0; i < midiMessageData.length; i++){
        let message = new MidiMessage(midiMessageData[i]);
        console.log(message);
        if(message.status == "control_change"){
            let control = getControlByCC(message.value1, message.channel);
            if(control){
                app.log(control.name + ": " + message.value2);
                control_values[control.id] = message.value2;
                // Update UI element if exists and is not currently being changed by the user
                let element = document.querySelector(`[data-control-id="${control.id}"]`);
                if(element && element.matches(":not(:active)")){
                    element.value = message.value2;
                }

                // If host, also broadcast to clients                
                if(app.role === 'host' && app.ws && app.ws.readyState === WebSocket.OPEN){
                    app.sendWs({type:'control', id: control.id, value: message.value2});
                }
            } else {
                app.log("Unknown control change: ch " + message.channel + " cc " + message.value1 + " value " + message.value2);
            }
        }
    }
}

app.load();