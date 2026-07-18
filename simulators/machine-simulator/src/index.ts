/**
 * GruaHub Machine Simulator
 * Simula controladores de máquinas de pelúcia conectando via MQTT ao EMQX.
 *
 * Uso:
 *   TENANT_ID=xxx MACHINE_IDS=id1,id2 npm run dev [<command>]
 *
 * Comandos (variável SCENARIO):
 *   normal           — fluxo padrão (heartbeat + responde comandos)
 *   duplicate-ack    — envia CREDIT_RECEIVED duas vezes para o mesmo comando
 *   gap-sequence     — envia mensagem com sequência pulada (simula sequência faltante)
 *   offline-recover  — fica offline 5s depois reconecta e reenvia heartbeat
 *   motor-fault      — publica ERROR_REPORT com motorFault=true
 *
 * Sinais UNIX:
 *   SIGUSR1 — simula MOTOR_FAULT na primeira máquina
 *   SIGUSR2 — toggle OFFLINE/ONLINE na primeira máquina
 */

import * as mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

// ================================================================
// Configuração via variáveis de ambiente
// ================================================================
const BROKER_URL     = process.env.MQTT_BROKER_URL      || 'tcp://localhost:1883';
const USERNAME       = process.env.MQTT_USERNAME        || 'sim-machine';
const PASSWORD       = process.env.MQTT_PASSWORD        || 'sim-machine-pass';
const TENANT_ID      = process.env.TENANT_ID            || '11111111-0000-0000-0000-000000000001';
const MACHINE_IDS_RAW = process.env.MACHINE_IDS         || '66666666-0000-0000-0000-000000000001';
const HEARTBEAT_MS   = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10);
const SCENARIO       = process.env.SCENARIO             || process.argv[2] || 'normal';

const machineIds = MACHINE_IDS_RAW.split(',').map(s => s.trim()).filter(Boolean);

// ================================================================
// Estado local de cada máquina simulada
// ================================================================
interface MachineState {
  machineId: string;
  sequence: number;
  online: boolean;
  creditsAvailable: number;
  firmwareVersion: string;
  doorOpen: boolean;
  motorFault: boolean;
}

const machines = new Map<string, MachineState>();

for (const id of machineIds) {
  machines.set(id, {
    machineId: id,
    sequence: 0,
    online: true,
    creditsAvailable: 0,
    firmwareVersion: '1.2.3-sim',
    doorOpen: false,
    motorFault: false,
  });
}

// ================================================================
// Funções de construção de mensagens (envelope padrão)
// ================================================================
function buildEnvelope(machineId: string, type: string, payload: object): string {
  const state = machines.get(machineId)!;
  state.sequence += 1;
  return JSON.stringify({
    messageId: uuidv4(),
    schemaVersion: 1,
    tenantId: TENANT_ID,
    machineId,
    controllerId: `ctrl-${machineId.substring(0, 8)}`,
    sequence: state.sequence,
    type,
    occurredAt: new Date().toISOString(),
    payload,
  });
}

function topic(machineId: string, suffix: string): string {
  return `v1/${TENANT_ID}/machines/${machineId}/${suffix}`;
}

// ================================================================
// Conectar ao broker
// ================================================================
console.log(`[GruaHub Simulator] Connecting to ${BROKER_URL} as ${USERNAME}...`);
console.log(`[GruaHub Simulator] Simulating ${machineIds.length} machine(s):`, machineIds);

const client = mqtt.connect(BROKER_URL, {
  username: USERNAME,
  password: PASSWORD,
  clientId: `gruahub-sim-${uuidv4().substring(0, 8)}`,
  clean: false,
  reconnectPeriod: 3000,
  connectTimeout: 10000,
});

client.on('connect', () => {
  console.log(`[GruaHub Simulator] Connected to MQTT broker (scenario: ${SCENARIO})`);

  // Assinar tópicos de comandos para todas as máquinas
  const commandTopics = machineIds.map(id => topic(id, 'commands'));
  client.subscribe(commandTopics, { qos: 1 }, (err) => {
    if (err) {
      console.error('[GruaHub Simulator] Subscribe error:', err.message);
    } else {
      console.log('[GruaHub Simulator] Subscribed to command topics');
    }
  });

  // Iniciar comportamento conforme cenário
  switch (SCENARIO) {
    case 'gap-sequence':
      runGapSequenceScenario();
      break;
    case 'offline-recover':
      runOfflineRecoverScenario();
      break;
    case 'motor-fault':
      runMotorFaultScenario();
      break;
    // 'normal', 'duplicate-ack' — o duplicate-ack é acionado via handleGrantCredit
    default:
      startHeartbeats();
      break;
  }
});

client.on('error', (err) => {
  console.error('[GruaHub Simulator] MQTT error:', err.message);
});

client.on('reconnect', () => {
  console.log('[GruaHub Simulator] Reconnecting...');
});

client.on('disconnect', () => {
  console.log('[GruaHub Simulator] Disconnected from broker');
});

// ================================================================
// Processar comandos recebidos
// ================================================================
client.on('message', (topicStr: string, message: Buffer) => {
  try {
    const payload = JSON.parse(message.toString());
    const machineId = topicStr.split('/')[3];

    if (!machineId || !machines.has(machineId)) {
      console.warn(`[GruaHub Simulator] Unknown machineId in topic ${topicStr}`);
      return;
    }

    const state = machines.get(machineId)!;
    const commandType = payload.payload?.type || payload.type;

    console.log(`[Machine ${machineId.substring(0, 8)}] Command received: ${commandType}`, payload.payload);

    if (commandType === 'GRANT_CREDIT' || payload.type === 'GRANT_CREDIT') {
      handleGrantCredit(state, payload);
    }
  } catch (e) {
    console.error('[GruaHub Simulator] Error processing command:', e);
  }
});

// ================================================================
// Handlers de comandos
// ================================================================
async function handleGrantCredit(state: MachineState, envelope: any): Promise<void> {
  const cmdPayload = envelope.payload;
  const commandId    = cmdPayload?.commandId;
  const creditGrantId = cmdPayload?.creditGrantId;
  const playsGranted  = cmdPayload?.playsGranted || 1;

  console.log(`[Machine ${state.machineId.substring(0, 8)}] Processing GRANT_CREDIT: ${playsGranted} play(s)`);

  state.creditsAvailable += playsGranted;

  // 1. ACK de crédito recebido
  await delay(300);
  const ackMsg = buildEnvelope(state.machineId, 'CREDIT_RECEIVED', {
    commandId,
    creditGrantId,
    status: 'EXECUTED',
    creditsAvailable: state.creditsAvailable,
  });
  client.publish(topic(state.machineId, 'command-acks'), ackMsg, { qos: 1 });
  console.log(`[Machine ${state.machineId.substring(0, 8)}] Sent CREDIT_RECEIVED ACK`);

  // Cenário: duplicate-ack — envia o mesmo ACK novamente (backend deve ignorar)
  if (SCENARIO === 'duplicate-ack') {
    await delay(150);
    client.publish(topic(state.machineId, 'command-acks'), ackMsg, { qos: 1 });
    console.log(`[Machine ${state.machineId.substring(0, 8)}] [duplicate-ack] Sent duplicate CREDIT_RECEIVED — backend should deduplicate`);
  }

  // 2. Simular jogada após 1s
  await delay(1000);
  if (state.creditsAvailable > 0) {
    await simulatePlay(state, creditGrantId);
  }
}

async function simulatePlay(state: MachineState, creditGrantId: string): Promise<void> {
  state.creditsAvailable -= 1;

  // PLAY_STARTED
  const startMsg = buildEnvelope(state.machineId, 'PLAY_STARTED', {
    creditGrantId,
    creditsRemaining: state.creditsAvailable,
  });
  client.publish(topic(state.machineId, 'events'), startMsg, { qos: 1 });
  console.log(`[Machine ${state.machineId.substring(0, 8)}] PLAY_STARTED`);

  // Duração da jogada: 2-5s
  const playDuration = 2000 + Math.random() * 3000;
  await delay(playDuration);

  // Probabilidade de ganhar: 15%
  const prizeDelivered = Math.random() < 0.15;

  const completeMsg = buildEnvelope(state.machineId, 'PLAY_COMPLETED', {
    creditGrantId,
    prizeDelivered,
    creditsRemaining: state.creditsAvailable,
    durationMs: Math.round(playDuration),
  });
  client.publish(topic(state.machineId, 'events'), completeMsg, { qos: 1 });
  console.log(`[Machine ${state.machineId.substring(0, 8)}] PLAY_COMPLETED prizeDelivered=${prizeDelivered}`);
}

// ================================================================
// Heartbeat periódico
// ================================================================
function startHeartbeats(): void {
  for (const [machineId, state] of machines) {
    // Heartbeat imediato na inicialização
    sendHeartbeat(state);

    setInterval(() => {
      if (state.online) {
        sendHeartbeat(state);
      } else {
        console.log(`[Machine ${machineId.substring(0, 8)}] OFFLINE — skipping heartbeat`);
      }
    }, HEARTBEAT_MS);
  }
}

function sendHeartbeat(state: MachineState): void {
  const msg = buildEnvelope(state.machineId, 'HEARTBEAT', {
    online: true,
    creditsAvailable: state.creditsAvailable,
    firmwareVersion: state.firmwareVersion,
    doorOpen: state.doorOpen,
    motorFault: state.motorFault,
    uptimeSeconds: Math.floor(process.uptime()),
  });
  client.publish(topic(state.machineId, 'telemetry'), msg, { qos: 0 });
  console.log(`[Machine ${state.machineId.substring(0, 8)}] Heartbeat sent (seq=${state.sequence})`);
}

// ================================================================
// Cenários especiais
// ================================================================

/**
 * gap-sequence: publica heartbeat normal, depois pula sequência (sequência 1, 2, 4 — faltou 3).
 * O backend deve detectar o gap e criar um alerta.
 */
async function runGapSequenceScenario(): Promise<void> {
  const [firstId] = machineIds;
  const state = machines.get(firstId)!;
  console.log(`[gap-sequence] Starting for machine ${firstId.substring(0, 8)}`);

  sendHeartbeat(state); // seq 1
  await delay(500);
  sendHeartbeat(state); // seq 2
  await delay(500);

  // Pular sequência 3 manualmente: forçar sequência para 4
  state.sequence += 1;
  sendHeartbeat(state); // seq 4 (gap em 3)

  console.log('[gap-sequence] Sent sequences 1, 2, 4 — backend should detect gap at 3');
  startHeartbeats(); // continuar normalmente depois
}

/**
 * offline-recover: fica offline 5s e depois reconecta publicando heartbeat.
 */
async function runOfflineRecoverScenario(): Promise<void> {
  const [firstId] = machineIds;
  const state = machines.get(firstId)!;
  console.log(`[offline-recover] Machine ${firstId.substring(0, 8)} going OFFLINE for 5s`);

  sendHeartbeat(state); // online
  state.online = false;

  await delay(5000);

  state.online = true;
  console.log(`[offline-recover] Machine ${firstId.substring(0, 8)} back ONLINE`);
  sendHeartbeat(state); // reaparece

  startHeartbeats();
}

/**
 * motor-fault: publica ERROR_REPORT imediato e restaura após 10s.
 */
async function runMotorFaultScenario(): Promise<void> {
  const [firstId] = machineIds;
  const state = machines.get(firstId)!;
  console.log(`[motor-fault] Simulating MOTOR_FAULT on machine ${firstId.substring(0, 8)}`);

  sendHeartbeat(state);

  state.motorFault = true;
  const errMsg = buildEnvelope(state.machineId, 'ERROR_REPORT', {
    motorFault: true,
    doorOpen: state.doorOpen,
    errorCode: 'E001',
    description: 'Motor fault injected by motor-fault scenario',
  });
  client.publish(topic(state.machineId, 'events'), errMsg, { qos: 1 });
  console.log('[motor-fault] ERROR_REPORT published — backend should create MAINTENANCE alert');

  setTimeout(() => {
    state.motorFault = false;
    console.log('[motor-fault] Motor fault cleared after 10s');
    sendHeartbeat(state);
  }, 10_000);

  startHeartbeats();
}

// ================================================================
// Simulação de erros via sinais UNIX
// ================================================================
process.on('SIGUSR1', () => {
  const firstMachine = [...machines.values()][0];
  if (firstMachine) {
    console.log(`[GruaHub Simulator] Simulating MOTOR_FAULT on machine ${firstMachine.machineId.substring(0, 8)}`);
    firstMachine.motorFault = true;
    const errMsg = buildEnvelope(firstMachine.machineId, 'ERROR_REPORT', {
      motorFault: true,
      doorOpen: firstMachine.doorOpen,
      errorCode: 'E001',
      description: 'Motor fault simulated by SIGUSR1',
    });
    client.publish(topic(firstMachine.machineId, 'events'), errMsg, { qos: 1 });
    setTimeout(() => { firstMachine.motorFault = false; }, 30000);
  }
});

process.on('SIGUSR2', () => {
  const firstMachine = [...machines.values()][0];
  if (firstMachine) {
    console.log(`[GruaHub Simulator] Toggling OFFLINE for machine ${firstMachine.machineId.substring(0, 8)}`);
    firstMachine.online = !firstMachine.online;
    console.log(`[GruaHub Simulator] Machine now ${firstMachine.online ? 'ONLINE' : 'OFFLINE'}`);
  }
});

// ================================================================
// Utilitários
// ================================================================
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', () => {
  console.log('\n[GruaHub Simulator] Shutting down...');
  client.end(true, () => process.exit(0));
});

process.on('SIGTERM', () => {
  client.end(true, () => process.exit(0));
});
