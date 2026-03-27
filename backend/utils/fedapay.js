'use strict';

class FedaPay {
  static setApiKey() {}
  static setEnvironment() {}
}

class Customer {
  static async create(payload = {}) {
    return {
      id: payload.id || `cus_${Date.now()}`,
      ...payload,
    };
  }
}

class Transaction {
  constructor(payload = {}) {
    this.id = payload.id || `txn_${Date.now()}`;
    this.payload = payload;
  }

  static async create(payload = {}) {
    return new Transaction(payload);
  }

  async generateToken() {
    return {
      url: this.payload.callback_url || 'https://checkout.fedapay.example/token',
    };
  }
}

module.exports = {
  FedaPay,
  Customer,
  Transaction,
};
