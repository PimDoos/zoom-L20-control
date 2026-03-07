var controls = {};

controls.map = {};

const BUS_NAMES = {
    0: "Master",
    1: "Monitor A",
    2: "Monitor B",
    3: "Monitor C",
    4: "Monitor D",
    5: "Monitor E",
    6: "Monitor F"
};

class Controller {
    constructor(id, displayName, controller_number, channel, value_range, mapped_range, unit = null, default_value = 0){
        this.id = id; // Controller unique ID
        this.displayName = displayName; // Controller display name
        this.controller_number = controller_number; // MIDI CC number
        this.channel = channel; // MIDI channel
        this.value_range = value_range;
        this.mapped_range = mapped_range;
        this.unit = unit;
        this.value = default_value; // MIDI value (0-127)
        this.mapped_value = mapRange(default_value, value_range[0], value_range[1], mapped_range[0], mapped_range[1]); // Value mapped to unit
    }
    updateValue(value, source){
        this.value = value;
        this.mapped_value = mapRange(value, this.value_range[0], this.value_range[1], this.mapped_range[0], this.mapped_range[1]);
        this.element.value = value;
        app.log(`[${source}] ${this.displayName}: ${this.mapped_value.toFixed(1)}${this.unit ? " " + this.unit : ""}`);
    }
    writeValue(value){
        this.updateValue(value, "local");
        let message = midi.createControlChangeMessage(this.channel, this.controller_number, value);
        midi.sendMessage(message);

        // Write to WebSocket if connected
        if(app.ws){
            app.sendWs({type:'control', id: this.id, value: Number(this.value)});
        }

        // Write to BLE if connected
        if(app && app.bleMidi && app.bleMidi.characteristic){
            let midiData = midi.createControlChangeMessage(this.channel, this.controller_number, value);
            midi.sendMessage(midiData);
        }
        
    }
    createElement(type){
        let element;
        switch(type){
            case "fader":
                element = document.createElement("input");
                element.type = "range";
                element.classList.add("fader");
                element.min = this.value_range[0];
                element.max = this.value_range[1];
                element.dataset.controlId = this.id;
                element.id = `${type}-${this.id}`;
                element.value = this.value;
                element.addEventListener("input", function(e){
                    let control = controls.map[this.dataset.controlId];
                    control.writeValue(e.target.value);
                });
                break;
        }
        this.element = element;
        return element;
    }
}
function mapRange(value, in_min, in_max, out_min, out_max){
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

// Returns the first matching control (keeps previous behavior) or null.
function getControlByCC(controller_number, channel){
    const key = `${channel}:${controller_number}`;
    const list = CONTROL_INDEX.get(key);
    return (list && list.length) ? list[0] : null;
}

function getControlElementById(control_id){
    return document.querySelector(`[data-control-id="${control_id}"]`);
}

function writeSystemMessage(bytes){
    midiMessageData = new Uint8Array([0x80,0x80, ...bytes])
    app.midi.characteristic.writeValue(midiMessageData);
    app.log(`Sent system message: ${bytes.join(" ")}`);
}

// Create controllers

for(let bus = 0; bus <= 6; bus++){
    // Bus level
    let bus_cc = 83;
    let bus_ch = bus;
    let bus_id = BUS_NAMES[bus].toLowerCase().replace(" ", "_");
    if (bus == 0){
        bus_cc = 84;
        bus_ch = 11;
    }
    let control = new Controller(
        id = `${bus_id}_level`,
        displayName = `${BUS_NAMES[bus]} Level`,
        controller_number = bus_cc,
        channel = bus_ch,
        value_range = [0, 120],
        mapped_range = [-100, 10],
        unit = "dB",
        default_value = 0
    );
    controls.map[control.id] = control;

    // Channel strips
    // Channel 1-16: Mono
    for(let ch = 1; ch <= 16; ch++){
        let control = new Controller(
            id = `${bus_id}_channel_${ch}_level`,
            displayName = `${BUS_NAMES[bus]} Channel ${ch} Level`,
            controller_number = 60 + bus * 2,
            channel = ch,
            value_range = [0, 120],
            mapped_range = [-100, 10],
            unit = "dB",
            default_value = 60
        );
        controls.map[control.id] = control;
    }

    // Channel 17-18 + 19-20: Stereo L/R (CC applies to both channels)
    for(let ch = 17; ch <= 19; ch+=2){
        let control = new Controller(
            id = `${bus_id}_channel_${ch}_level`,
            displayName = `${BUS_NAMES[bus]} Channel ${ch} Level`,
            controller_number = 61 + bus * 2,
            channel = ch - 16,
            value_range = [0, 120],
            mapped_range = [-100, 10],
            unit = "dB",
            default_value = 60
        );
        controls.map[control.id] = control;
    }

    // EFX Returns
    for(let efx = 1; efx <= 2; efx++){
        let cc, ch;
        if(bus == 0){
            cc = 80
            ch = 12 + efx;
        } else if(bus <= 4){
            cc = 81;
            ch = efx + ((bus - 1) * 4);
        
        } else if(bus <= 6){
            cc = 82;
            ch = efx + ((bus - 5) * 4);
        }
        let control = new Controller(
            id = `${bus_id}_channel_${ch}_level`,
            displayName = `${BUS_NAMES[bus]} EFX ${efx} Level`,
            controller_number = cc,
            channel = ch,
            value_range = [0, 120],
            mapped_range = [-100, 10],
            unit = "dB"
        );
        controls.map[control.id] = control;
    }
}
// Recorder
for(let i = 0; i < 4; i++){
    let time_label;
    switch(i){
        case 0:
            time_label = "days";
            break;
        case 1:
            time_label = "hours";
            break;
        case 2:
            time_label = "minutes";
            break;
        case 3:
            time_label = "seconds";
            break;
    }

    let control = new Controller(
        id = `recorder_time_${time_label}`,
        displayName = `Recorder Time ${time_label}`,
        controller_number = 88,
        channel = 9 + i,
        value_range = [0, 60],
        mapped_range = [0, 60],
        unit = time_label
    );
    controls.map[control.id] = control;
}

let recorder_playing_control = new Controller(
    id = `recorder_playing`,
    displayName = `Recorder Playing`,
    controller_number = 87,
    channel = 9,
    value_range = [0, 1],
    mapped_range = [0, 1],
    default_value = 0
);
controls.map[recorder_playing_control.id] = recorder_playing_control;


// Storage time remaining
for(let i = 0; i < 4; i++){
    let time_label;
    switch(i){
        case 0:
            time_label = "days";
            break;
        case 1:
            time_label = "hours";
            break;
        case 2:
            time_label = "minutes";
            break;
        case 3:
            time_label = "seconds";
            break;
    }
    let control = new Controller(
        id = `storage_remaining_${time_label}`,
        displayName = `Storage Remaining ${time_label}`,
        controller_number = 88,
        channel = 13 + i,
        value_range = [0, 60],
        mapped_range = [0, 60],
        unit = time_label
    );
    controls.map[control.id] = control;
}

// Presets
let preset_select_control = new Controller(
    id = `preset_select`,
    displayName = `Preset Select`,
    controller_number = 86,
    channel = 11,
    value_range = [0, 8],
    mapped_range = [1, 9]
);
controls.map[preset_select_control.id] = preset_select_control;

// Fast lookup index: key = "ch:cc" -> array of controls (preserves duplicates)
const CONTROL_INDEX = new Map();

function buildControlIndex(){
    CONTROL_INDEX.clear();
    for(let i = 0; i < controls.map.length; i++){
        let control = controls.map[i];
        let key = `${control.channel}:${control.controller_number}`;
        if(!CONTROL_INDEX.has(key)) CONTROL_INDEX.set(key, []);
        CONTROL_INDEX.get(key).push(control);
    }
}

// Build index at load time
buildControlIndex();
