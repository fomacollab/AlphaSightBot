let enabled = true;

function set(nextValue) {
  enabled = Boolean(nextValue);
}

function get() {
  return enabled;
}

module.exports = { set, get };
