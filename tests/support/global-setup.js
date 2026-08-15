const { startStaticServer } = require('./static-server');

module.exports = async function globalSetup() {
  const server = await startStaticServer();

  return async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  };
};
