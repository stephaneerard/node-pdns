var mysql = require('mysql');
var spawn = require('child_process').spawn;
var fs = require('fs');
var Step = require('step');

var client = null;

var adapter = module.exports = {

  init: function(config, callback) {
    client = mysql.createClient(config);
    client.useDatabase(config.db, function(err) {
      createTablesIfNotExist(config, callback);
    });
  },

  domains: {
    
    list: function(callback) {
      client.query('SELECT * FROM domains', function(err, results, fields) {
        if (err) {
          callback(err);
          return;
        }
        callback(null, results);
      });
    },
    
    add: function(domain, callback) {
      if(!domain || !checkDomainName(domain.name)) {
        callback(new Error("domain name invalid"));
        return;
      }
      client.query('INSERT INTO domains SET name=?, type=?, '
                  +'ttl=?, created_at=NOW(), updated_at=NOW()',
                   [domain.name, (domain.type || 'NATIVE').toUpperCase(),
                    domain.ttl || 84600],
                   callback);
    },

    remove: function(domain, callback) {
      if(!domain || !checkDomainName(domain.name)) {
        callback(new Error("domain name invalid"));
        return;
      }
      client.query('DELETE FROM domains WHERE name=? AND type LIKE ?'
                 +' AND ttl LIKE ? AND created_at LIKE ?'
                 +' AND updated_at LIKE ?',
                   [domain.name, domain.type || '%',
                    domain.ttl || '%', domain.created_at || '%', 
                    domain.updated_at || '%'],
                   callback);
    }
  },

  records: {
    
    list: function(domainName, record, callback) {
      if(!checkDomainName(domainName)) {
        callback(new Error("domain invalid"));
        return;
      }
      if(!callback) {
        callback = record;
        record = null;
      }
      record = record || {};
      client.query('SELECT R.* FROM records R JOIN domains D ON R.domain_id=D.id '
                  +'WHERE D.name=? AND R.name LIKE ? AND R.type LIKE ? '
                  +'AND R.content LIKE ? AND R.ttl LIKE ?',
                   [domainName, record.name || '%', record.type || '%',
                    record.content || '%', record.ttl || '%'],
                   function(err, results, fields) {
        if (err) {
          callback(err);
          return;
        }
        callback(null, results);
      });
    },

    add: function(domainName, record, callback) {
      if(!checkDomainName(domainName)) {
        callback(new Error("domain invalid"));
        return;
      }
      if(!record || !checkString(record.name)) {
        callback(new Error("name invalid"));
        return;
      }
      if(!checkString(record.content)) {
        callback(new Error("content invalid"));
        return;
      }
      if(!checkDomainName(record.name)) {
        record.name += '.'+domainName;
      }
      client.query('INSERT INTO records SET '
                  +'domain_id=(SELECT id FROM domains WHERE name=? LIMIT 1), '
                  +'name=?, content=?, type=?, ttl=?, '
                  +'change_date=UNIX_TIMESTAMP(), created_at=NOW(), updated_at=NOW()',
                   [domainName,
                    record.name, record.content, record.type.toUpperCase(), record.ttl || 84600],
                   callback);
    },

    remove: function(domainName, record, callback) {
      if(!checkDomainName(domainName)) {
        callback(new Error("domain invalid"));
        return;
      }
      if(!record || !checkString(record.name)) {
        callback(new Error("record name invalid"));
        return;
      }
      if(!checkDomainName(record.name)) {
        record.name += '.'+domainName;
      }
      console.log([record.name, record.type || '%', record.content || '%',
                    record.ttl || '%', record.change_date || '%', record.created_at || '%',
                    record.updated_at || '%', domainName]);
      client.query('DELETE FROM records WHERE name=? AND type LIKE ? AND content LIKE ?'
                 +' AND ttl LIKE ? AND change_date LIKE ? AND created_at LIKE ?'
                 +' AND updated_at LIKE ?'
                 +' AND domain_id=(SELECT id FROM domains WHERE name=? LIMIT 1)',
                   [record.name, record.type || '%', record.content || '%',
                    record.ttl || '%', record.change_date || '%', record.created_at || '%',
                    record.updated_at || '%', domainName],
                   callback);
    }
  }

};


function createTablesIfNotExist(config, callback) {
  Step(
    function() {
      readSQLFile(__dirname+'/mysql_create.sql', this);
    },
    function(err, queries) {
      if(err) {
        this(err);
        return;
      }
      var group = this.group();
      queries.forEach(function(q) {
        client.query(q, group());
      });
    },
    callback
  );
}

function readSQLFile(filepath, callback) {
  fs.readFile(filepath, 'utf8', function(err, data) {
    if(err) {
      callback(err);
      return;
    }
    var queries = data.match(new RegExp("([^;]*?('.*?')?)*?;\\s*", "gi"))
    callback(null, queries.map(function(q) { return trim(q); }));
  });
}

function trim(str) {
	var	str = str.replace(/^\s\s*/, ''),
		ws = /\s/,
		i = str.length;
	while (ws.test(str.charAt(--i)));
	return str.slice(0, i + 1);
}

function checkString(obj) {
  return (obj && typeof obj == 'string' && obj.length > 0);
}

function checkDomainName(obj) {
  if(!checkString(obj)) return false;
  var words = obj.split('.');
  if(words.length < 2) return false;
  var wordsOk = true;
  words.forEach(function(w) {
    wordsOk &= checkString(w);
  });
  return wordsOk;
}

