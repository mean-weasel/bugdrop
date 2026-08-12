(function () {
  var DB_NAME = 'bugdrop-local-qa';
  var DB_VERSION = 1;
  var STORE_NAME = 'submissions';
  var originalFetch = window.fetch.bind(window);

  function isLocalHost() {
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.localhost')
    );
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error);
      };
      transaction.onabort = function () {
        reject(transaction.error);
      };
    });
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function withStore(mode, callback) {
    var database = await openDatabase();
    try {
      var transaction = database.transaction(STORE_NAME, mode);
      var result = await callback(transaction.objectStore(STORE_NAME));
      await transactionDone(transaction);
      return result;
    } finally {
      database.close();
    }
  }

  async function create(payload) {
    var now = new Date().toISOString();
    return withStore('readwrite', async function (store) {
      return requestResult(
        store.add({
          createdAt: now,
          updatedAt: now,
          payload: payload,
        })
      );
    });
  }

  async function list() {
    var records = await withStore('readonly', function (store) {
      return requestResult(store.getAll());
    });
    return records.sort(function (left, right) {
      return right.id - left.id;
    });
  }

  function get(id) {
    return withStore('readonly', function (store) {
      return requestResult(store.get(Number(id)));
    });
  }

  function update(record) {
    return withStore('readwrite', function (store) {
      record.updatedAt = new Date().toISOString();
      return requestResult(store.put(record));
    });
  }

  function remove(id) {
    return withStore('readwrite', function (store) {
      return requestResult(store.delete(Number(id)));
    });
  }

  function clear() {
    return withStore('readwrite', function (store) {
      return requestResult(store.clear());
    });
  }

  async function readPayload(input, init) {
    if (init && typeof init.body === 'string') {
      return JSON.parse(init.body);
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return input.clone().json();
    }
    return null;
  }

  function addInboxLink() {
    if (window.location.pathname.indexOf('/test/submissions') === 0) return;
    if (document.getElementById('bugdrop-local-inbox-link')) return;
    var link = document.createElement('a');
    link.id = 'bugdrop-local-inbox-link';
    link.href = '/test/submissions.html';
    link.textContent = 'Local submissions';
    link.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:2147483000;padding:9px 12px;border:1px solid #ff9e64;border-radius:8px;background:#24283b;color:#fff;text-decoration:none;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    document.body.appendChild(link);
  }

  function relabelLocalIssueLink() {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      var root = document.querySelector('#bugdrop-host');
      var link = root && root.shadowRoot && root.shadowRoot.querySelector('.bd-issue-link');
      if (link && link.getAttribute('href').indexOf('/test/submissions.html') !== -1) {
        Array.from(link.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
        });
        link.appendChild(document.createTextNode(' View local submission'));
        link.setAttribute('aria-label', 'View local submission');
        window.clearInterval(timer);
      } else if (attempts >= 100) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  window.BugDropLocalSubmissions = {
    create: create,
    list: list,
    get: get,
    update: update,
    remove: remove,
    clear: clear,
  };

  if (!isLocalHost() || window.__BugDropLocalQaFetchInstalled) return;
  window.__BugDropLocalQaFetchInstalled = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addInboxLink, { once: true });
  } else {
    addInboxLink();
  }

  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : input.url;

    if (url.indexOf('/api/check/') !== -1) {
      return new Response(JSON.stringify({ installed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.endsWith('/feedback')) {
      var payload = await readPayload(input, init);
      var id = await create(payload);
      relabelLocalIssueLink();
      return new Response(
        JSON.stringify({
          success: true,
          issueNumber: id,
          issueUrl: window.location.origin + '/test/submissions.html?id=' + id,
          isPublic: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return originalFetch(input, init);
  };
})();
