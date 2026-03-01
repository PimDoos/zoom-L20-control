const MIDI_SERVICE_UID            = '03B80E5A-EDE8-4B33-A751-6CE34EC4C700'.toLowerCase();
const MIDI_IO_CHARACTERISTIC_UID  = '7772E5DB-3868-4112-A1A9-F2669D106BF3'.toLowerCase();

var app = {
    elements:{
        connectButton: document.getElementById("connect"),
        disconnectButton: document.getElementById("disconnect"),
        log: document.getElementById("log"),
        bus_faders: document.getElementById("bus_faders")
    },
    midi: {},
    map: {},
};

app.log = function(message){
    var log = app.elements.log;
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
}
app.load = function(){
    
    for(let bus = 0; bus <= 6; bus++){
        let control_id = `${BUS_NAMES[bus].toLowerCase().replace(" ", "_")}_level`;
        let control = getControlById(control_id);

        let container = document.createElement("div");
        container.classList.add("channel-strip","bus");

        let element = createControlElement(control_id);

        let label = document.createElement("label");
        label.textContent = control ? control.name : control_id;
        label.htmlFor = element.id;
        container.appendChild(label);
        container.appendChild(element);

        app.elements.bus_faders.appendChild(container);
    }
    app.log("App loaded");
}

app.connect = function(){
    app.log("Connecting...");

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
    })
    .catch(error => {
        app.log("Error: " + error);
    });
}
app.elements.connectButton.addEventListener('click', app.connect);

app.disconnect = function(){
    if(app.midiCharacteristic){
        app.midiCharacteristic.stopNotifications();
        app.midiCharacteristic.removeEventListener('characteristicvaluechanged', app.handleMidiMessage);
        app.midiCharacteristic.service.device.gatt.disconnect();
        app.log("Disconnected");
    } else {
        app.log("No device connected");
    }
}
app.elements.disconnectButton.addEventListener('click', app.disconnect);

app.handleMidiMessage = function(event){
    let value = event.target.value;
    // Process MIDI message (this is just a placeholder)
    let midiData = new Uint8Array(value.buffer);
    let midiMessageData = [];
    let timeStampHeader = midiData[0];
    
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
                    element.value = message.value2;}
            } else {
                app.log("Unknown control change: ch " + message.channel + " cc " + message.value1 + " value " + message.value2);
            }
        }
    }
}

// TODO add WebRTC support for control from multiple devices

app.load();