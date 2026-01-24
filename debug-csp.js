fetch('http://localhost:5000/admin.html').then(r => console.log(r.headers.get('Content-Security-Policy')));
