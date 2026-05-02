const MIDI_SERVICE_UID            = '03B80E5A-EDE8-4B33-A751-6CE34EC4C700'.toLowerCase();
const MIDI_IO_CHARACTERISTIC_UID  = '7772E5DB-3868-4112-A1A9-F2669D106BF3'.toLowerCase();

var app = {
    elements:{
        bleConnectButton: document.getElementById("ble_connect"),
        wsConnectButton: document.getElementById("ws_connect"),
        shareButton: document.getElementById("share_link"),

        log: document.getElementById("log"),
        roomId: document.getElementById("room_id"),
        nick: document.getElementById("nick"),
        color: document.getElementById("color"),
        peers: document.getElementById("peers"),
    },
    bleMidi: {},
    map: {},
    connectivity: {
        bleConnected: false,
        wsConnected: false,
    }
};

app.log = function(message){
    var log = app.elements.log;
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
}

app.setStatus = function(kind, status){
    if(kind === 'ws' && app.elements.wsConnectButton){    
        app.elements.wsConnectButton.dataset["status"] = status;
        app.connectivity.wsConnected = status == "connected";
    } 
    if(kind === 'ble' && app.elements.bleConnectButton){
        if(status == 'connected') app.setRole('host');
        else app.setRole('client');
        app.elements.bleConnectButton.dataset["status"] = status;
        app.connectivity.bleConnected = status == "connected";
    }
    if(app.connectivity.bleConnected || app.connectivity.wsConnected){
        setControlsEnabled(true);
    } else {
        setControlsEnabled(false);
    }
}
app.setRole = function(role){
    app.role = role;
    if(app.ws){
        app.wsSend({type:'role', role: app.role, nick: app.nick, color: app.color});
        if(app.role == 'host'){
            app.wsSendFullState();
        }
    }
}

// WebSocket networking helpers
app.ws = null;
app.role = 'client';
app.roomId = self.crypto.randomUUID();
if(location.host && location.hostname !== 'localhost'){
    app.wsBaseUrl = `wss://${location.host}/ws`;
} else {
    app.wsBaseUrl = 'ws://127.0.0.1:8081/ws';
}

app.nick = '';
app.color = '#00aaff';

app.wsSend = function(obj){
    if(!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
    try{
        app.ws.send(JSON.stringify(obj));
    } catch(e){
        app.log('WS send error: ' + e);
    }
}
app.wsSendFullState = function(){
    let message = {
        type: "full_state",
        state: {},
        strips: {}
    }
    for(let control_id in controls.map){
        message.state[control_id] = controls.map[control_id].value;
    }
    for(let strip_id in strips){
        message.strips[strip_id] = {
            displayName: strips[strip_id].displayName,
            color: strips[strip_id].color,
        }
    }
    app.wsSend(message);
}

app.handleWsMessage = function(event){
    try{
        let message = JSON.parse(event.data);
        if(message.type === 'control'){
            let control = controls.map[message.id];
            if(control){
                // Write to control
                control.writeValue(message.value, "ws");
            }
        } else if(message.type == "request_state"){
            app.wsSendFullState();
        } else if(message.type == 'full_state'){
            // apply full state
            for(let control_id in message.state){
                let value = message.state[control_id];
                let control = controls.map[control_id];
                control.updateValue(value, "ws");
            }
            for(let strip_id in message.strips){
                let strip = strips[strip_id];
                strip.updateDisplayName(message.strips[strip_id].displayName);
                strip.updateColor(message.strips[strip_id].color);
            }
        } else if(message.type === 'peers'){
            if(Array.isArray(message.peers)){
                app.updatePeersUI(message.peers);
            }
        } else if(message.type == 'peak'){
            for(let strip_id in message.strips){
                let strip = strips[strip_id];
            }
        }
    } catch(e){
        app.log('WS message parse error: ' + e);
    }
}

app.wsConnect = function(){
    app.setStatus('ws', 'connecting');

    try {
        app.wsUrl = app.wsBaseUrl + '/' + app.roomId;
    } catch(e){
        app.setStatus('ws','error');
        app.log('WebSocket URL build failed: ' + e);
        return;
    }
    try {
        app.ws = new WebSocket(app.wsUrl);
        app.ws.addEventListener('open', () => {
            app.setStatus('ws', 'connected');
            app.log('WebSocket connected to ' + app.wsUrl + ' as ' + app.role);
            app.wsSend({type:'role', role: app.role, nick: app.nick, color: app.color});
            // If client, request state
            if(app.role === 'client'){
                app.wsSend({type:'request_state'});
            } else if (app.role == 'host'){
                app.wsSendFullState();
            }
        });
        app.wsRetryCount = 0;
        app.ws.addEventListener('message', app.handleWsMessage);
        app.ws.addEventListener('close', () => { 
            app.setStatus('ws','disconnected'); app.log('WebSocket closed'); 
            app.updatePeersUI([]);
        });
        app.ws.addEventListener('error', (e) => { 
            app.setStatus('ws','error'); app.log('WebSocket error'); 
            app.updatePeersUI([]);
            if(app.wsRetryCount < 5){
                setTimeout(app.wsConnect, 1000 * Math.pow(2, app.wsRetryCount));
                app.wsRetryCount++;
            }
        });
    } catch(e){
        app.setStatus('ws','error');
        app.log('WebSocket connect error: ' + e);
    }
}
app.wsDisconnect = function(){
    if(app.ws){
        app.ws.close();
        app.elements.peers.innerHTML = '';
    }
    app.ws = null;
}
app.elements.wsConnectButton.addEventListener('click', function(){
    if(!app.connectivity.wsConnected){
        app.wsConnect();
    } else {
        app.wsDisconnect();
    }
});

app.bleConnect = function(){
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
        app.bleMidi.characteristic = characteristic;
        return characteristic.startNotifications();
    })
    .then(() => {
        app.log("Notifications started");
        app.bleMidi.characteristic.addEventListener('characteristicvaluechanged', midi.handleData);
        app.setStatus('ble','connected');
        midi.commands.patch_request();
        if(app.peaksEnabled){
            midi.commands.peaks_start();
        }
    })
    .catch(error => {
        app.log("Error: " + error);
        app.setStatus('ble','error');
    });
}

app.bleDisconnect = function(){
    let characteristic = app.bleMidi && app.bleMidi.characteristic;
    if(characteristic){
        try{ characteristic.stopNotifications(); } catch(e){}
        try{ characteristic.removeEventListener('characteristicvaluechanged', midi.handleData); } catch(e){}
        try{ characteristic.service.device.gatt.disconnect(); } catch(e){}
        app.log("Disconnected");
        app.setStatus('ble','disconnected');
    } else {
        app.log("No device connected");
        app.setStatus('ble','disconnected');
    }
}
app.elements.bleConnectButton.addEventListener('click', function(){
    if(!app.connectivity.bleConnected){
        app.bleConnect();
    } else {
        app.bleDisconnect();
    }
});

// Read parameters from location.hash (format: #foo=bar&foo2=bar2)
app.readHashParams = function(){
    let params = {};
    try{
        let raw = (location.hash || '').replace(/^#\/?/, '');
        if(!raw) return params;
        raw.split('&').forEach(pair => {
            if(!pair) return;
            let parts = pair.split('=');
            let key = decodeURIComponent(parts[0] || '');
            let value = decodeURIComponent(parts.slice(1).join('=') || '');
            if(key) params[key] = value;
        });
        // Supported params: room
        if(params.room){
            app.roomId = params.room;
        }
    } catch(e){
        app.log('Error parsing hash params: ' + e);
    }
    return params;
}

app.load = function(){
    app.setStatus("ble","disconnected");
    app.setStatus("ws","disconnected");

    
    if(app.elements.shareButton){
        let shareData = {
            title: 'Zoom L20 Control',
            text: 'Join my Zoom L20 Control room: ' + app.roomId,
            url: location.origin + location.pathname + '#room=' + encodeURIComponent(app.roomId),
        };
        
        if(navigator.canShare(shareData)){
            app.elements.shareButton.dataset["canshare"] = true;
            app.elements.shareButton.addEventListener('click', function(){
                // Re-create shareData in case roomId has changed
                let shareData = {
                    title: 'Zoom L20 Control',
                    text: 'Join my Zoom L20 Control room: ' + app.roomId,
                    url: location.origin + location.pathname + '#room=' + encodeURIComponent(app.roomId),
                };
                navigator.share(shareData).catch(e => {
                    app.log('Error sharing: ' + e);
                });
            });
        } else {
            app.elements.shareButton.dataset["canshare"] = false;
        }
    }
    
    let main = document.querySelector("main");

    /* Recorder */
    let recorderContainer = recorder.createElement();
    main.appendChild(recorderContainer);
    
    /* Inspector */
    let inspectorElement = inspector.createElement();
    main.appendChild(inspectorElement);

    inspector.setStrip(buses['master'].strips['master_channel_1']);

    /* Graphic Equalizer */
    let geqContainer = graphic_eq.createElement();
    main.appendChild(geqContainer);


    /* Buses / Channel strips */
    let busTabsContainer = document.createElement("div");
    busTabsContainer.id = "bus-tabs";

    let busTabBar = document.createElement("div");
    busTabBar.id = "bus-tab-bar";
    busTabsContainer.appendChild(busTabBar);

    let isFirst = true;
    for(const bus_id in buses){

        let bus = buses[bus_id];
        let busElement = bus.createElement();
        busElement.classList.add("bus-tab-panel");
        
        busTabsContainer.appendChild(busElement);

        let stripContainer = bus.stripsContainer;
        for(const strip_id in bus.strips){
            let strip = bus.strips[strip_id];
            let stripElement = strip.createElement();
            if(strip.id == bus.id) stripElement.classList.add("master");
            else if(strip.id.indexOf("efx") != -1) stripElement.classList.add("effect");
            stripContainer.appendChild(stripElement);
        }

        let tabButton = document.createElement("button");
        tabButton.classList.add("bus-tab-btn");
        tabButton.dataset.busId = bus_id;
        tabButton.textContent = bus.displayName;
        tabButton.addEventListener("click", function(){
            document.querySelectorAll("#bus-tabs .bus-tab-panel").forEach(p => delete p.dataset.active);
            document.querySelectorAll("#bus-tab-bar .bus-tab-btn").forEach(b => b.classList.remove("active"));
            busElement.dataset.active = "true";
            tabButton.classList.add("active");
        });

        if(isFirst){
            busElement.dataset.active = "true";
            tabButton.classList.add("active");
            isFirst = false;
        }
        busTabBar.appendChild(tabButton);
    }

    main.appendChild(busTabsContainer);
    
    document.getElementById("initial-load").remove();
    setControlsEnabled(false);

    // Load persistent settings from localStorage and wire identity change events
    try{
        const savedNick = localStorage.getItem('nick');
        const savedColor = localStorage.getItem('color');
        const savedRoom = localStorage.getItem('room');
        if(app.elements.roomId && savedRoom){
            app.roomId = savedRoom;
        }
        if(app.elements.nick && savedNick){ 
            app.nick = savedNick;
        }
        if(app.elements.color && savedColor){ 
            app.color = savedColor;
        }
        
    }catch(e){ }

    // Read any supported parameters from the location hash (overrides saved settings)
    try{
        let hashParams = app.readHashParams();
        if(!hashParams.room){
            const newHash = '#room=' + encodeURIComponent(app.roomId);
            history.replaceState(null, '', newHash);
        }
    } catch(e){}
    
    // Re-read when the hash changes
    window.addEventListener('hashchange', app.readHashParams);

    if(app.elements.roomId){
        app.elements.roomId.value = app.roomId;
        app.elements.roomId.addEventListener('change', (e)=>{ 
            app.roomId = e.target.value;
            try{ localStorage.setItem('room', e.target.value); }catch(_){} 
        });
        
    }
    if(app.elements.nick){
        app.elements.nick.value = app.nick;
        app.elements.nick.addEventListener('change', (e)=>{
            app.nick = e.target.value;
            try{ localStorage.setItem('nick', app.nick); }catch(_){}
            if(app.ws && app.ws.readyState === WebSocket.OPEN) app.wsSend({type:'identity', nick: app.nick, color: app.color});
        });
    }
    if(app.elements.color){
        app.elements.color.value = app.color;
        app.elements.color.addEventListener('change', (e)=>{
            app.color = e.target.value;
            try{ localStorage.setItem('color', app.color); }catch(_){}
            if(app.ws && app.ws.readyState === WebSocket.OPEN) app.wsSend({type:'identity', nick: app.nick, color: app.color});
        });
    }

    let peaksEnabledCheckbox = document.getElementById('peaks_enabled');
    if(peaksEnabledCheckbox){
        peaksEnabledCheckbox.addEventListener('change', (e)=>{
            app.peaksEnabled = e.target.checked;
            if(!app.peaksEnabled){
                midi.commands.peaks_stop();
            } else {
                midi.commands.peaks_start();
            }
        });
    }

    let patchRequestButton = document.getElementById("patch_request");
    if(patchRequestButton){
        patchRequestButton.addEventListener("click", (e)=>{
            midi.commands.patch_request();
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
            text.textContent = (p.nick || 'unnamed')
            if(p.role == 'host') text.textContent += ' (host)';
            text.style.color = p.color || '#999';
            item.appendChild(text);
            app.elements.peers.appendChild(item);
        });
    }

    // Try WS connect
    app.wsConnect();

    // Reconnect WS when page becomes visible again (mostly for mobile)
    document.addEventListener('visibilitychange', function(){
        if(document.visibilityState === 'visible' && !app.connectivity.wsConnected){
            app.wsConnect();
        }
    });

    app.log("App loaded");
}

app.load();