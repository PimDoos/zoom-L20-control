var controls = {};
var buses = {};
var strips = {};

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
class MixerBus {
    constructor(id, displayName, label, bus_number){
        this.id = id;
        this.displayName = displayName;
        this.label = label;
        this.bus_number = bus_number;
        this.strips = {};

        this.busElement = null;
        this.stripsContainer = null;
    }
    createElement(){
        this.busElement = document.createElement("div");
        this.busElement.id = this.id + "_bus";
        this.busElement.classList.add("bus");

        let busHeader = document.createElement("h2");
        busHeader.innerText = this.displayName;
        this.busElement.appendChild(busHeader);

        this.stripsContainer = document.createElement("div");
        this.stripsContainer.classList.add("strips");
        this.stripsContainer.id = this.id + "_strips";
        this.busElement.appendChild(this.stripsContainer);

        return this.busElement;
    }
}
class MixerStrip {
    constructor(id, bus, channel, stereo = false) {
        this.id = id;
        this.bus = bus;
        this.bus.strips[this.id] = this;

        this.channel = channel;
        this.stereo = stereo;

        this.color = 0;
        this.displayName = `CH ${channel}`;
        this.levelController = null;
        this.muteController = null;
        this.soloController = null;
        this.recordController = null;
        this.eqControllers = [];
        this.fxControllers = [];
        this.containerElement = null;
        this.meterElements = [];
        this.labelElement = null;
        this.valueLabelElement = null;
        strips[this.id] = this;
    }
    createElement(){
        this.containerElement = document.createElement("div");
        this.containerElement.classList.add("channel-strip");
        this.containerElement.dataset.colorId = this.color;

        this.labelElement = document.createElement("span");
        this.labelElement.classList.add("label");
        this.labelElement.textContent = this.displayName;
        this.containerElement.appendChild(this.labelElement);

        if(this.bus.id == "master"){
            let meter = document.createElement("meter");
            meter.id = `${this.id}_meter`;
            meter.classList.add("peak");
            meter.min = 0;
            meter.max = 0x0C;
            meter.high = 8;
            meter.value = 0;
            this.meterElements.push(meter);
            this.containerElement.appendChild(meter);
        }

        let stripFader = this.levelController.createElement("fader");
        this.containerElement.appendChild(stripFader);

        

        if(this.stereo && this.bus.id == "master"){
            let meter = document.createElement("meter");
            meter.id = `${this.id.replace(this.channel, this.channel + 1)}_meter`;
            meter.classList.add("peak");
            meter.min = 0;
            meter.max = 0x0C;
            meter.high = 8;
            meter.value = 0;
            this.meterElements.push(meter);
            this.containerElement.appendChild(meter);
        }
        this.valueLabelElement = document.createElement("label");
        this.valueLabelElement.textContent = this.levelController.formatted_value;
        this.valueLabelElement.htmlFor = stripFader.id;
        this.levelController.label = this.valueLabelElement;
        this.containerElement.appendChild(this.valueLabelElement);

        if(this.bus.id == "master"){
            if(this.muteController){
                let muteButton = this.muteController.createElement("toggle");
                muteButton.classList.add("mute");
                muteButton.innerText = "M";
                this.containerElement.appendChild(muteButton);
            }
            
            if(this.soloController){
                let soloButton = this.soloController.createElement("toggle");
                soloButton.classList.add("solo");
                soloButton.innerText = "S";
                this.containerElement.appendChild(soloButton);
            }
            if(this.recordController){
                let recordSelect = this.recordController.createElement("select");
                recordSelect.classList.add("record");
                this.containerElement.appendChild(recordSelect);

            }
            
        }
        return this.containerElement;
        
    }
    updateDisplayName(newDisplayName){
        this.displayName = newDisplayName;
        this.labelElement.innerText = newDisplayName;
    }
    updateColor(newColor){
        this.color = newColor;
        this.containerElement.dataset.colorId = newColor;
    }

}
class Controller {
    constructor(id, displayName, controller_number, channel, value_range, mapping = null, unit = null, default_value = 0){
        this.id = id; // Controller unique ID
        this.displayName = displayName; // Controller display name
        this.controller_number = controller_number; // MIDI CC number
        this.channel = channel; // MIDI channel
        this.value_range = value_range;
        this.mapping = mapping;
        this.unit = unit;
        this.value = default_value; // MIDI value (0-127)
        this.mapped_value = this.mapValue(default_value); // Value mapped to unit
        this.formatted_value = this.formatValue(this.mappedValue);
        this.labelValue = "formatted";
        controls.map[this.id] = this;
    }
    mapValue(value){
        let in_min = value_range[0];
        let in_max = value_range[1];
        let out_min = 0;
        let out_max = 100;
        if(this.mapping == null) return value;

        if(typeof this.mapping == "string"){
            switch(this.mapping){
                case "fader":
                    return 0x2C * Math.log10(value / 0x52);
                case "monitor":
                    return 0x2C * Math.log10(value / 0x52);
                case "eq_gain":
                    out_min = -15;
                    out_max = 15;
                    break;
                case "bool":
                    return value > 0;
                case "pan":
                    return value - 50;
                case "plus1":
                    return value + 1;
            }
            return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
        } else {
            return this.mapping[value];
        }
        
    }
    formatValue(value){
        if(typeof this.mapped_value == "number"){
            return `${this.mapped_value.toFixed(0).replace("Infinity","∞")}${this.unit ? " " + this.unit : ""}`
        } else {
            return this.mapped_value;
        }
    }
    updateValue(value, source){
        this.value = value;
        this.mapped_value = this.mapValue(value);
        if(this.element){
            switch(this.element.nodeName){
                case "BUTTON":
                    this.element.dataset.value = value;
                    break;
                case "DIV":
                    if(this.element.classList.contains("recorder-transport")){
                        this.element.dataset.value = value;
                    }
                default:
                    if(this.element != document.activeElement) this.element.value = value;
                    break;
            }

        }
        
        this.formatted_value = this.formatValue(this.mapped_value);
        app.log(`[${source}] ${this.displayName}: ${this.formatted_value}`);
        if(this.label){
            if(this.labelValue == "formatted") this.label.innerText = this.formatted_value;
            else if(this.labelValue == "mapped") this.label.innerText = this.mapped_value;
            else this.label.innerText = this.value;
        } 
    }
    writeValue(value, source = "local"){
        this.updateValue(value, source);
        if(app.connectivity.wsConnected && source != "ws"){
            app.wsSend({type:'control', id: this.id, value: Number(this.value)});
        }
        // Write to BLE if connected
        if(app.connectivity.bleConnected && source != "midi"){
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
            case "toggle":
                element = document.createElement("button");
                element.classList.add("toggle");
                element.dataset.controlId = this.id;
                element.id = `${type}-${this.id}`;
                element.dataset.value = this.value;
                element.addEventListener("click", function(e){
                    let control = controls.map[this.dataset.controlId];
                    let newValue = (parseInt(this.dataset.value) + 1) % (control.value_range[1] + 1);
                    control.writeValue(newValue)
                });

                break
            case "select":
                element = document.createElement("select");
                element.dataset.controlId = this.id;
                element.id = `${type}-${this.id}`;
                
                for(const i in this.mapping){
                    let optionElement = document.createElement("option");
                    optionElement.value = i;
                    optionElement.innerText = this.mapping[i];
                    element.appendChild(optionElement);
                }
                element.value = this.value;

                element.addEventListener("change", function(e){
                    let control = controls.map[this.dataset.controlId];
                    control.writeValue(parseInt(e.target.value));
                });
                break;
            case "transport":
                element = document.createElement("div");
                element.classList.add("recorder-transport");

                let stopButton = document.createElement("button");
                stopButton.classList.add("stop");
                stopButton.dataset.controlId = this.id;
                stopButton.addEventListener("click", function(e){
                    let control = controls.map[this.dataset.controlId];
                    control.writeValue(0);
                });
                element.appendChild(stopButton);

                let playButton = document.createElement("button");
                playButton.classList.add("play");
                playButton.dataset.controlId = this.id;
                playButton.addEventListener("click", function(e){
                    let control = controls.map[this.dataset.controlId];
                    if(control.value == 3) control.writeValue(5);
                    else if(control.value == 0) control.writeValue(1);
                });
                element.appendChild(playButton);

                let recordButton = document.createElement("button");
                recordButton.classList.add("record");
                recordButton.dataset.controlId = this.id;
                recordButton.addEventListener("click", function(e){
                    let control = controls.map[this.dataset.controlId];
                    if(control.value == 0) control.writeValue(3);
                });
                element.appendChild(recordButton);

        }
        this.element = element;
        return element;
    }
}

class Recorder {
    constructor(){
        this.transportControl = null;
        this.statusControl = null;
        this.positionControl = {};
        this.remainingControl = {};

        this.fileNameElement = null;
        this.fileName = "--------_------";
    }
    createElement(){
        this.container = document.createElement("div");
        this.container.classList.add("recorder");

        this.fileNameElement = document.createElement("span");
        this.fileNameElement.innerText = this.fileName;
        this.container.appendChild(this.fileNameElement);

        let positionElement = document.createElement("div");
        positionElement.classList.add("position","timestamp");
        for(let time_unit in this.positionControl){
            let controller = this.positionControl[time_unit];
            let element = document.createElement("span");
            controller.label = element;
            controller.labelValue = "mapped";
            element.innerText = controller.mapped_value;
            positionElement.appendChild(element);
        }
        this.container.appendChild(positionElement);

        let remainingElement = document.createElement("div");
        remainingElement.classList.add("remaining","timestamp");
        for(let time_unit in this.remainingControl){
            let controller = this.remainingControl[time_unit];
            let element = document.createElement("span");
            controller.label = element;
            controller.labelValue = "mapped";
            element.innerText = controller.mapped_value;
            remainingElement.appendChild(element);
        }
        this.container.appendChild(remainingElement);
        
        let recorderTransportElement = this.transportControl.createElement("transport");
        this.container.appendChild(recorderTransportElement);

        return this.container;
    }
    updateFileName(newFileName){
        this.fileName = newFileName;
        this.fileNameElement.innerText = this.fileName;
    }
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


// Controller definitions
for(let bus_num = 0; bus_num < Object.entries(BUS_NAMES).length; bus_num++){
    // Bus level
    let bus_cc = 83;
    let bus_ch = bus_num;
    let bus_id = BUS_NAMES[bus_num].toLowerCase().replace(" ", "_");
    let bus = new MixerBus(bus_id, BUS_NAMES[bus_num], (bus_num == 0) ? "Master" : BUS_NAMES[bus_num].slice(-1), bus_num);
    buses[bus_id] = bus;

    // Master strip
    let masterStrip = new MixerStrip(
        id = bus_id,
        bus = bus,
        channel = "master",
        stereo = true
    )
    masterStrip.displayName = bus.displayName;

    if (bus_num == 0){
        bus_cc = 84;
        bus_ch = 11;
    }
    masterStrip.levelController = new Controller(
        id = `${bus_id}_level`,
        displayName = `${BUS_NAMES[bus_num]} Level`,
        controller_number = bus_cc,
        channel = bus_ch,
        value_range = [0, 120],
        mapping = "fader",
        unit = "dB",
        default_value = 0x2D
    );
    if(bus_num == 0){
        masterStrip.recordController = new Controller(
            id = `${bus_id}_record`,
            displayName = `${BUS_NAMES[bus_num]} Record`,
            controller_number = bus_cc,
            channel = 9,
            value_range = [0, 2],
            mapping = ["off","play","record"],
            unit = null,
            default_value = 0
        )
        masterStrip.muteController = new Controller(
            id = `${bus_id}_mute`,
            displayName = `${BUS_NAMES[bus_num]} Mute`,
            controller_number = bus_cc,
            channel = 10,
            value_range = [0, 1],
            mapping = "bool",
            unit = null,
            default_value = 0
        )
    }

    // EFX Returns
    for(let efx = 1; efx <= 2; efx++){
        let strip = new MixerStrip(
            id = `${bus_id}_efx_${efx}`,
            bus = bus,
            channel = "efx"+efx,
            stereo = true
        )
        strip.displayName = "EFX " + efx;
        strips[strip.id] = strip;

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
        strip.levelController = new Controller(
            id = `${bus_id}_efx_${efx}_level`,
            displayName = `${BUS_NAMES[bus_num]} EFX ${efx} Level`,
            controller_number = cc,
            channel = ch,
            value_range = [0, 120],
            mapping = "fader",
            unit = "dB",
            default_value = 0x2D
        );
        strip.muteController = new Controller(
            id = `${bus_id}_efx_${efx}_mute`,
            displayName = `${BUS_NAMES[bus_num]} EFX ${efx} Mute`,
            controller_number = cc,
            channel = 4 + efx,
            value_range = [0, 1],
            mapping = "bool",
            unit = null,
            default_value = 0
        );
        strip.muteController = new Controller(
            id = `${bus_id}_efx_${efx}_solo`,
            displayName = `${BUS_NAMES[bus_num]} EFX ${efx} Solo`,
            controller_number = cc,
            channel = 8 + efx,
            value_range = [0, 1],
            mapping = "bool",
            unit = null,
            default_value = 0
        );
        
    }

    // Input channel strips
    for(let ch = 1; ch <= 19; ch++){
        if(ch == 18) continue;
        let strip = new MixerStrip(
            id = `${bus_id}_channel_${ch}`,
            bus = bus,
            channel = ch,
            stereo = ch > 16
        )

        strip.levelController = new Controller(
            id = `${bus_id}_channel_${ch}_level`,
            displayName = `Channel ${ch} Level`,
            controller_number = 60 + (bus_num * 2) + (ch > 16),
            channel = (ch <= 16) ? ch : ch - 16,
            value_range = [0, 120],
            mapping = "fader",
            unit = "dB",
            default_value = 0x3f
        );

        if(bus.id == "master"){
            strip.muteController = new Controller(
                id = `${bus_id}_channel_${ch}_mute`,
                displayName = `Channel ${ch} Mute`,
                controller_number = 48 + (ch > 16),
                channel = (ch <= 16) ? ch : ch - 16,
                value_range = [0, 1],
                mapping = "bool",
                unit = null,
                default_value = 0
            );

             strip.soloController = new Controller(
                id = `${bus_id}_channel_${ch}_solo`,
                displayName = `Channel ${ch} Solo`,
                controller_number = 50 + (ch > 16),
                channel = (ch <= 16) ? ch : ch - 16,
                value_range = [0, 1],
                mapping = "bool",
                unit = null,
                default_value = 0
            );


            strip.recordController = new Controller(
                id = `${bus_id}_channel_${ch}_record`,
                displayName = `Channel ${ch} Record`,
                controller_number = 8 + (ch > 16),
                channel = (ch <= 16) ? ch : ch - 16,
                value_range = [0, 2],
                mapping = ["off","play","record"],
                unit = null,
                default_value = 0,
            )
        }
    }

}
// Recorder

var recorder = new Recorder();

recorder.transportControl = new Controller(
    id = `recorder_playing`,
    displayName = `Recorder Playing`,
    controller_number = 87,
    channel = 9,
    value_range = [0, 1],
    mapping = ["stop","play","paused","armed","recording_paused","recording"],
    default_value = 0
);
recorder.statusControl = new Controller(
    id = `recorder_status`,
    displayName = `Recorder Status`,
    controller_number = 89,
    channel = 10,
    value_range = [0, 16],
    mapping = [,,,,,,,,,"no_channels"],
    unit = null,
    default_value = 0
);
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

    recorder.positionControl[time_label] = new Controller(
        id = `recorder_position_${time_label}`,
        displayName = `Recorder Position ${time_label}`,
        controller_number = 88,
        channel = 9 + i,
        value_range = [0, 60],
        mapping = null,
        unit = time_label,
        default_value = 0,
    );

    recorder.remainingControl[time_label] = new Controller(
        id = `recorder_remaining${time_label}`,
        displayName = `Storage Remaining ${time_label}`,
        controller_number = 88,
        channel = 13 + i,
        value_range = [0, 60],
        mapping = null,
        unit = time_label,
        default_value = 0,
    );
}





// Presets
let preset_select_control = new Controller(
    id = `preset_select`,
    displayName = `Preset Select`,
    label = `Preset`,
    bus = buses["master"],
    controller_number = 86,
    channel = 11,
    value_range = [0, 8],
    mapping = "plus1"
);

// Fast lookup index: key = "ch:cc" -> array of controls (preserves duplicates)
const CONTROL_INDEX = new Map();

function buildControlIndex(){
    CONTROL_INDEX.clear();
    for(let control_id in controls.map){
        let control = controls.map[control_id];
        let key = `${control.channel}:${control.controller_number}`;
        if(!CONTROL_INDEX.has(key)) CONTROL_INDEX.set(key, []);
        CONTROL_INDEX.get(key).push(control);
    }
}

// Build index at load time
buildControlIndex();
