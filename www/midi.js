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
    logMessage: false,
    logParsed: false,
    logSend: false,
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
                if(midi.debug.logMessage){
                    console.log(message);
                }
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
            control.writeValue(message.value, "midi");
        }
    } else if(message.status == "system_message"){
        let commandByte = message.values[3];
        if (commandByte in MIDI_SYSEX_BYTES){
            let command = MIDI_SYSEX_BYTES[commandByte];
            if(command == "peaks_data"){
                let data = message.values.slice(0x06, 0x38);

                /**
                 * Data is bitmasked:
                 * - 0x00-0x0C: Peak values
                 * - 0x10: Signal bit
                 * - 0x20: Clip bit
                 * 
                 * Address 0-19: Master channels 1-20 Pre-fader
                 * Address 20-23: EFX1+2 L/R Pre-fader
                 * Address 24-43: Channels 1-20 Post-fader
                 * Address 44-47: EFX1+2 L/R Post-fader
                 * Address 48-49: Master L/R Post-fader
                 */

                let channelPeak = [];
                let channelSignal = [];
                let channelClip = [];
                for(let i = 0; i < 50; i++){
                    channelPeak.push(data[i] & 0x0F);
                    channelSignal.push((data[i] & 0x10) > 0);
                    channelClip.push((data[i] & 0x20) > 0);
                }

                if(midi.debug.logParsed){
                    console.log(channelPeak, channelSignal, channelClip);
                }

                for(let i = 1; i <= 20; i++){
                    let meterElement = document.getElementById(`master_channel_${i}_meter`);
                    if(meterElement){
                        meterElement.value = channelPeak[i - 1];
                        meterElement.dataset["signal"] = channelSignal[i - 1] > 0;
                        meterElement.dataset["clip"] = channelClip[i - 1] > 0;

                    }
                }
                for(let i = 21; i <= 24; i++){
                    let meterElement = document.getElementById(`master_efx${i-20}_meter`);
                    if(meterElement){
                        meterElement.value = channelPeak[i - 1];
                        meterElement.dataset["signal"] = channelSignal[i - 1] > 0;
                        meterElement.dataset["clip"] = channelClip[i - 1] > 0;
                    }
                }
                for(let i = 49; i <= 50; i++){
                    let meterElement = document.getElementById(`master_${(i % 2) ? "l" : "r"}_meter`);
                    if(meterElement){
                        meterElement.value = channelPeak[i - 1];
                        meterElement.dataset["signal"] = channelSignal[i - 1] > 0;
                        meterElement.dataset["clip"] = channelClip[i - 1] > 0;
                    }
                }
            } else if(command == "patch_response"){
                const decoder = new TextDecoder();
                const CHANNEL_CONTROL_ADDR = {
                    0xAA: "color",
                    0xBC: "record",
                    0xCE: "mute",
                    0xE0: "solo",
                    0x104: "pan",
                    0x116: "eq_off",
                    0x128: "eq_high_gain",
                    0x13A: "eq_mid_frequency",
                    0x14C: "eq_mid_gain",
                    0x15E: "eq_low_gain",
                    0x170: "eq_low_cut",
                    0x182: "efx_1",
                    0x194: "efx_2",
                    0x1A6: "master_level",
                    0x1B8: "monitor_a_level",
                    0x1CA: "monitor_b_level",
                    0x1DC: "monitor_c_level",
                    0x1EE: "monitor_d_level",
                    0x200: "monitor_e_level",
                    0x212: "monitor_f_level",
                }
                for(let i = 0; i < 18; i++){
                    let channelPatch = {number: i < 17 ? i + 1 : i + 2};
                    let stringLength = 0x09;
                    let startIndex = 0x08 + i * stringLength;
                    let stopIndex = startIndex + stringLength;
                    let stringBytes = message.values.slice(startIndex,stopIndex).filter(x => x != 0x00);
                    
                    channelPatch.displayName = decoder.decode(
                        new Uint8Array(stringBytes)
                    );

                    for(let address in CHANNEL_CONTROL_ADDR){
                        let addressName = CHANNEL_CONTROL_ADDR[address];
                        let addressStart = parseInt(address) + i;
                        channelPatch[addressName] = message.values[addressStart];
                    }

                    if(midi.debug.logParsed){
                        console.log(channelPatch);
                    }
                    for(let bus_id in buses){
                        let strip = buses[bus_id].strips[`${bus_id}_channel_${channelPatch.number}`];
                        if(strip){
                            if(strip.levelController) strip.levelController.updateValue(channelPatch[bus_id + "_level"], "midi");
                            strip.updateColor(channelPatch.color);
                            strip.updateDisplayName(channelPatch.displayName);
                            if(bus_id == "master"){
                                strip.recordController.updateValue(channelPatch.record, "midi");
                                strip.muteController.updateValue(channelPatch.mute, "midi");
                                strip.soloController.updateValue(channelPatch.solo, "midi");
                                strip.fxControllers[0].updateValue(channelPatch.efx_1,"midi");
                                strip.fxControllers[1].updateValue(channelPatch.efx_2,"midi");
                            }
                        }
                        
                    }
                }
                
                let masterPatch = {
                    record: message.values[0x240],
                    mute: message.values[0x241],
                };
                const MASTER_CONTROL_ADDR = ["master_level", "monitor_a_level", "monitor_b_level", "monitor_c_level", "monitor_d_level", "monitor_e_level", "monitor_f_level"]
                for(let i in MASTER_CONTROL_ADDR){
                    let index_num = parseInt(i);
                    masterPatch[MASTER_CONTROL_ADDR[index_num]] = message.values[0x242 + index_num];
                }
                if(midi.debug.logParsed){
                    console.log(masterPatch);
                }

                let recorderPatch = {
                    position:{
                        days: message.values[0x26F],
                        hours: message.values[0x270],
                        minutes: message.values[0x271],
                        seconds: message.values[0x272],
                    },
                    remaining:{
                        days: message.values[0x273],
                        hours: message.values[0x274],
                        minutes: message.values[0x275],
                        seconds: message.values[0x276],
                    }
                };
                recorderPatch.fileName = decoder.decode(
                    new Uint8Array(
                        message.values
                        .slice(0x27D, 0x28A)
                        .filter(x => x != 0x00)
                    )
                );

                for(let recorderPatchKey in recorderPatch){
                    for(let unit in recorderPatch[recorderPatchKey]){
                        let control_id = `recorder_${recorderPatchKey}_${unit}`;
                        let control = controls.map[control_id];
                        if(control){
                            control.updateValue(recorderPatch[recorderPatchKey][unit], "midi");
                        }
                    }
                    
                }
                if(recorderPatch.fileName){
                    recorder.updateFileName(recorderPatch.fileName);
                }

                if(midi.debug.logParsed){
                    console.log(recorderPatch);
                }

                if(app.ws){
                    app.wsSendFullState();
                }



            } else if(command == "scene_response"){
                // TODO handle incoming scene data
            }
        }
    }
}

midi.sendMessage = function(data){
    if(app && app.bleMidi && app.bleMidi.characteristic){
        try {
            if(midi.debug.logSend){
                console.log(data);
            }
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