import { isMachineUuid, parseMachineQrPayload } from '../inventory/resolveMachine';

describe('parseMachineQrPayload', () => {
  test('extrai UUID de deep link gruahub', () => {
    expect(
      parseMachineQrPayload('gruahub://machine/66666666-0000-0000-0000-000000000001')
    ).toBe('66666666-0000-0000-0000-000000000001');
  });

  test('mantém texto simples', () => {
    expect(parseMachineQrPayload('MAQUINA-001')).toBe('MAQUINA-001');
    expect(parseMachineQrPayload(' GH-MAQUINA-001 ')).toBe('GH-MAQUINA-001');
  });
});

describe('isMachineUuid', () => {
  test('valida UUID', () => {
    expect(isMachineUuid('66666666-0000-0000-0000-000000000001')).toBe(true);
    expect(isMachineUuid('MAQUINA-001')).toBe(false);
  });
});
