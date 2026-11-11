function(module, exports, require) {
  'use strict';
  Object.defineProperty(exports, '__esModule', {value: true});
  const Bus = require(313).default;
  const QuizApi = require(9995).default;
  const SystemApi = require(677).SystemApi;
  const bus = new Bus();
  const quizApi = new QuizApi('https://syncshare.naloaty.me/api/v2/');
  const systemApi = new SystemApi('https://syncshare.naloaty.me/api/v2/');
  const services = [
    new (require(9686).default)(),
    new (require(1718).default)(quizApi),
    new (require(8394).default)(),
    new (require(8651).default)(systemApi),
    new (require(1422).default)(systemApi),
  ];
  // Each init registers its handlers synchronously, before returning a Promise.
  // Do not await between them: Chrome can dispatch the wake-up event immediately.
  Promise.all(services.map(service => service.init(bus))).catch(error => {
    console.error('[SyncShare Resilient] Background initialization failed', error);
  });
}
