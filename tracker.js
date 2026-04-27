(function () {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: window.location.href,
      referrer: document.referrer,
    }),
  }).catch(function () {});
})();
