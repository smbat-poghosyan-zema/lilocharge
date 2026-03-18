import { RPCServer } from 'ocpp-rpc';

import { OcppServerFactory } from './ocpp.server.factory';

jest.mock('ocpp-rpc', () => {
  return {
    RPCServer: jest.fn(),
  };
});

describe('OcppServerFactory', () => {
  it('creates an ocpp-rpc server with provided protocol and strict mode options', () => {
    const factory = new OcppServerFactory();

    factory.createServer({
      protocols: ['ocpp1.6'],
      strictMode: true,
    });

    expect(RPCServer).toHaveBeenCalledWith({
      protocols: ['ocpp1.6'],
      strictMode: true,
    });
  });
});
