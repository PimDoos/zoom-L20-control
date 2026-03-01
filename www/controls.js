var control_map = [];
var control_values = {};

const BUS_NAMES = {
    0: "Master",
    1: "Monitor A",
    2: "Monitor B",
    3: "Monitor C",
    4: "Monitor D",
    5: "Monitor E",
    6: "Monitor F"
}
for(let bus = 0; bus <= 6; bus++){
    // Bus level
    let bus_cc = 83;
    let bus_ch = bus;
    let bus_id = BUS_NAMES[bus].toLowerCase().replace(" ", "_");
    if (bus == 0){
        bus_cc = 84;
        bus_ch = 11;
    }
    control_map.push({
        "id": `${bus_id}_level`,
        "name": `${BUS_NAMES[bus]} Level`,
        "cc": bus_cc,
        "ch": bus_ch,
        "type": "fader",
        "range": [0, 120],
        "value": [-100, 10],
        "unit": "dB"
    });

    // Channel strips
    // Channel 1-16: Mono
    for(let ch = 1; ch <= 16; ch++){
        control_map.push({
            "id": `${bus_id}_channel_${ch}_level`,
            "name": `${BUS_NAMES[bus]} Channel ${ch} Level`,
            "cc": 60 + bus * 2,
            "ch": ch,
            "type": "fader",
            "range": [0, 120],
            "value": [-100, 10],
            "unit": "dB"
        });
    }

    // Channel 17-18 + 19-20: Stereo L/R (CC applies to both channels)
    for(let ch = 17; ch <= 19; ch+=2){
        control_map.push({
            "id": `${bus_id}_channel_${ch}_level`,
            "name": `${BUS_NAMES[bus]} Channel ${ch} Level`,
            "cc": 61 + bus * 2,
            "ch": ch-16,
            "type": "fader",
            "range": [0, 120],
            "value": [-100, 10],
            "unit": "dB"
        });
    }

    // EFX Returns
    for(let efx = 1; efx <= 2; efx++){
        let efx_cc, efx_ch;
        if(bus == 0){
            efx_cc = 80
            efx_ch = 12 + efx;
        } else if(bus <= 4){
            efx_cc = 81;
            efx_ch = efx + ((bus - 1) * 4);
        
        } else if(bus <= 6){
            efx_cc = 82;
            efx_ch = efx + ((bus - 5) * 4);
        }
        control_map.push({
            "id": `${bus_id}_efx_${efx}_level`,
            "name": `${BUS_NAMES[bus]} EFX ${efx} Level`,
            "cc": efx_cc,
            "ch": efx_ch,
            "type": "fader",
            "range": [0, 120],
            "value": [-100, 10],
            "unit": "dB"
        });
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
    control_map.push({
        "id": `recorder_time_${time_label}`,
        "name": `Recorder Time ${time_label}`,
        "cc": 88,
        "ch": 9 + i,
        "type": "numeric",
        "range": [0, 60],
        "value": [0, 60],
        "unit": time_label
    });
}

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
    control_map.push({
        "id": `storage_remaining_${time_label}`,
        "name": `Storage remaining ${time_label}`,
        "cc": 88,
        "ch": 13 + i,
        "type": "numeric",
        "range": [0, 60],
        "value": [0, 60],
        "unit": time_label
    });
}


// Fast lookup index: key = "ch:cc" -> array of controls (preserves duplicates)
const CONTROL_INDEX = new Map();

function buildControlIndex(){
    CONTROL_INDEX.clear();
    for(let i = 0; i < control_map.length; i++){
        const c = control_map[i];
        const key = `${c.ch}:${c.cc}`;
        if(!CONTROL_INDEX.has(key)) CONTROL_INDEX.set(key, []);
        CONTROL_INDEX.get(key).push(c);
    }
}

// Build index at load time
buildControlIndex();

// Returns the first matching control (keeps previous behavior) or null.
function getControlByCC(cc, ch){
    const key = `${ch}:${cc}`;
    const list = CONTROL_INDEX.get(key);
    return (list && list.length) ? list[0] : null;
}
function getControlById(control_id){
    return control_map.find(c => c.id === control_id) || null;
}

function writeControlValue(control_id, value){
    const control = control_map.find(c => c.id === control_id);
    if(control){
        midiMessageData = new Uint8Array([180,180,MIDI_STATUS.control_change | (control.ch - 1), control.cc, value])
        app.midi.characteristic.writeValue(midiMessageData);
        control_values[control_id] = value;
        app.log(`Set ${control.name} to ${value}`);
    } else {
        app.log(`Unknown control ID: ${control_id}`);
    }
}

function createControlElement(control_id){
    const control = control_map.find(c => c.id === control_id);
    if(!control) return null;

    let element;
    switch(control.type){
        case "fader":
            element = document.createElement("input");
            element.type = "range";
            element.classList.add("fader");
            element.min = control.range[0];
            element.max = control.range[1];
            element.dataset.controlId = control.id;
            element.value = control_values[control_id] || 0;
            element.addEventListener("input", function(e){
                writeControlValue(control_id, e.target.value);
            });
            break;
    }
    return element;
}