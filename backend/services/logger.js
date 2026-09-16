const ts = () => new Date().toISOString();

module.exports = {
  info: (tag, msg) => console.log(`[${tag}] ${ts()} ${msg}`),
  warn: (tag, msg) => console.warn(`[${tag}] ${ts()} ${msg}`),
  error: (tag, msg) => console.error(`[${tag}] ${ts()} ${msg}`)
};
