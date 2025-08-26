// src/config.ts
import { Platform } from 'react-native';

const DEV_MACHINE_IP = '192.168.1.23'; // <-- put your Mac's LAN IP here

// heuristics:
// - iOS Simulator can use 127.0.0.1
// - Android emulator needs 10.0.2.2
// - Physical devices must use your Mac's LAN IP OR an HTTPS tunnel
const LOCAL_BASE =
  Platform.OS === 'ios'
    ? 'http://127.0.0.1:8000'
    : Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : `http://${DEV_MACHINE_IP}:8000`;

// If you spin up an ngrok/Cloudflare tunnel for HTTPS, set it here:
const TUNNEL_BASE = ''; // e.g. 'https://abc123.ngrok.io'

// export const API_URL = TUNNEL_BASE || LOCAL_BASE;
export const API_URL = 'http://192.168.0.81:8000'; // your Mac's LAN IP + backend port
