export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // Eigene TURN-Server eintragen (z. B. coturn). Beispiel:
  // {
  //   urls: ['turn:turn.example.com:3478', 'turn:turn.example.com:5349'],
  //   username: 'demo-user',
  //   credential: 'demo-pass'
  // }
];

export default ICE_SERVERS;
