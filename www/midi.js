class MidiMessage {
    constructor(data) {
        this.data = data;
        this.status_byte = data[0] & 0xF0;
        switch(this.status_byte) {
            case 0x80: // Note Off
                this.status = "note_off";
                break;
            case 0x90: // Note On
                this.status = "note_on";
                break;
            case 0xA0: // Polyphonic Key Pressure
                this.status = "polyphonic_key_pressure";
                break;
            case 0xB0: // Control Change
                this.status = "control_change";
                break;
            case 0xC0: // Program Change
                this.status = "program_change";
                break;
            case 0xD0: // Channel Pressure
                this.status = "channel_pressure";
                break;
            case 0xE0: // Pitch Bend
                this.status = "pitch_bend";
                break;
            case 0xF0: // System Message
                this.status = "system_message";
                break;
            default:
                this.status = "unknown";
                break;
        }

        this.channel = (data[0] & 0x0F) + 1;
        this.value1 = data[1];
        this.value2 = data[2];
    }
}
const MIDI_STATUS = {
    "note_off": 0x80,
    "note_on": 0x90,
    "polyphonic_key_pressure": 0xA0,
    "control_change": 0xB0,
    "program_change": 0xC0,
    "channel_pressure": 0xD0,
    "pitch_bend": 0xE0,
    "system_message": 0xF0
}
const MIDI_SYSEX = {
    "mfg_id": 0x52, // Zoom Corporation

}