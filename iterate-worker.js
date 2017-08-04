function iterate() {
    postMessage('iterate');
    setTimeout('iterate()', 100);
}
iterate();