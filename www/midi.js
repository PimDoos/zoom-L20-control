class MidiMessage {
    timeStampLsb = null;
    status = null;
    channel = null;
    controller = null;
    program = null;
    pitch_bend_value = null;


    constructor(data) {
        this.data = data;
        this.timeStampLsb = data[0];
        var status_byte = data[1] & 0xF0;
        if (status_byte in MIDI_STATUS_BYTES) {
            this.status = MIDI_STATUS_BYTES[status_byte];
        } else {
            this.status = "unknown";
        }
        
        if (this.status == "system_message") {
            this.values = data.slice(2);
        } else {
            this.channel = (data[1] & 0x0F) + 1;
            if (this.status == "control_change"){
                this.controller = data[2];
                this.value = data[3];
            } else if (this.status == "program_change"){
                this.program = data[2];
            } else if (this.status == "pitch_bend"){
                this.pitch_bend_value = (data[2] << 7) | data[1];
            } else if (this.status == "note_on" || this.status == "note_off"){
                this.note = data[2];
                this.velocity = data[3];
            }
        }
    }
}

var midi = {};

midi.sysEx = {};
midi.sysEx.buffer = [];
midi.sysEx.inProgress = false;

midi.debug = {
    logRaw: false,
    logMessage: true,
}

midi.handleData = function(event){
    let value = event.target.value;

    let midiData = new Uint8Array(value.buffer);

    let timeStampMsb = midiData[0];
    if(midi.debug.logRaw){
        console.log(midiData.toHex());
    }

    let startIndex = 2;
    if(midi.sysEx.inProgress){
        startIndex = 1;
    }

    for(let i = startIndex; i < midiData.length; i++){
        if (midiData[i] == MIDI_STATUS.system_message){
            midi.sysEx.inProgress = true;
            midi.sysEx.buffer = [midiData[i-1],midiData[i]];
        } else if(midiData[i] == MIDI_STATUS.system_message_end){
            midi.sysEx.inProgress = false;
            let message = new MidiMessage(midi.sysEx.buffer);

            if(midi.debug.logMessage){
                console.log(message);
            }

            midi.sysEx.buffer = [];
            midi.handleMessage(message);
        } else {
            if(midi.sysEx.inProgress){
                midi.sysEx.buffer.push(midiData[i]);
            } else {
                let timestampLsb = midiData[i];
                let message = new MidiMessage(midiData.slice(i-1, i+3));
                console.log(message);
                midi.handleMessage(message);
                i += 3; // skip the next 3 bytes since we've already processed them
            }
        }
    }
}

midi.handleMessage = function(message){
    midi.lastMessage = message;
    if(message.status == "control_change"){
        let control = getControlByCC(message.controller, message.channel);
        if(control){
            control.updateValue(message.value, "midi");
        }
    } else if(message.status == "system_message"){
        let commandByte = message.values[3];
        if (commandByte in MIDI_SYSEX_BYTES){
            let command = MIDI_SYSEX_BYTES[commandByte];
            if(command == "peaks_data"){
                // TODO write incoming peaks data to strip meters
                let data = message.values.slice(6, 6 + (18*2));
                let peakValues = data.slice(0, 19);
                let signalValues = data.slice(19, 19 + (18*2));


                for(let ch = 1; ch <= 19; ch++){
                    if(ch == 18) continue;
                    let meterElement = document.getElementById(`master_channel_${ch}_meter`);
                    if(meterElement){
                        meterElement.value = peakValues[ch - 1];
                    }
                }
            } else if(command == "patch_response"){
                let patchData = new TextDecoder().decode(
                    new Uint8Array(message.values.slice(8))
                ).split("\x00").slice(0, 39);
                console.log(patchData);

                // TODO handle incoming patch data: update controls and channel names
            } else if(command == "scene_response"){
                // TODO handle incoming scene data
            }
        }
    }
}

midi.sendMessage = function(data){
    if(app && app.bleMidi && app.bleMidi.characteristic){
        try {
            let midiMessageData = new Uint8Array(data);
            app.bleMidi.characteristic.writeValue(midiMessageData);
            return true;
        } catch (error) {
            console.error("Error sending MIDI message:", error);
            return false;
        }
    }
    return false;
}

midi.createControlChangeMessage = function(channel, controller, value){
    return new Uint8Array(
        [
            0x80,0x80,
            MIDI_STATUS.control_change | (channel - 1), 
            controller, value
        ]
    );
}
midi.createSystemMessage = function(commandByte, dataBytes = []){
    return new Uint8Array(
        [
            0x80,0x80,
            MIDI_STATUS.system_message,
            MIDI_SYSEX.mfg_id,
            0x00,
            0x00,
            commandByte,
            ...dataBytes,
            MIDI_STATUS.system_message_end
        ]
    );
}

const MIDI_STATUS = {
    "note_off": 0x80,
    "note_on": 0x90,
    "polyphonic_key_pressure": 0xA0,
    "control_change": 0xB0,
    "program_change": 0xC0,
    "channel_pressure": 0xD0,
    "pitch_bend": 0xE0,
    "system_message": 0xF0,
    "system_message_end": 0xF7,
}
const MIDI_STATUS_BYTES = Object.fromEntries(Object.entries(MIDI_STATUS).map(([key, value]) => [value, key]));

const MIDI_SYSEX = {
    "mfg_id": 0x52, // Zoom Corporation
    "scene_request": 0x07,
    "scene_response": 0x06,
    "patch_request": 0x2B,
    "patch_response": 0x2A,
    "peaks_data": 0x31,
    "peaks_start": 0x50,
    "peaks_stop": 0x51,
}
const MIDI_SYSEX_BYTES = Object.fromEntries(Object.entries(MIDI_SYSEX).map(([key, value]) => [value, key]));

midi.commands = {};
midi.commands.peaks_start = function(){
    let message = midi.createSystemMessage(MIDI_SYSEX.peaks_start, [0x80]);
    midi.sendMessage(message);
}
midi.commands.peaks_stop = function(){
    let message = midi.createSystemMessage(MIDI_SYSEX.peaks_stop, [0x80]);
    midi.sendMessage(message);
}
midi.commands.patch_request = function(){
    let message = midi.createSystemMessage(MIDI_SYSEX.patch_request, [0x80]);
    midi.sendMessage(message);
}