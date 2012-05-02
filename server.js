var server = require("http").createServer(serverCreated);
var io = require("socket.io").listen(server);
var fs = require("fs");
var url = require("url");
var path = require("path");

var port = process.env.PORT || 8080

server.listen(port); 

function serverCreated(req, res) {
	var uri = url.parse(req.url).pathname;
	if (uri == "/") uri = "/controller.html";
	var filename = path.join(process.cwd(), uri);
	path.exists(filename, function(exists) {
		if (!exists) {
			res.writeHead(404, {"Content-Type":"text/plain"});
			res.end("404! Not Found");
			return;
		}
		
		fs.readFile(filename, "binary", function(err, file) {
			if (err) {
				res.writeHead(500, {"Content-Type":"text/plain"});
				return res.end(err);
			}
			console.log("serving file");
			res.writeHead(200, {"Content-Type":"text/html"});
			res.end(file, "binary");
			console.log("served");
		});
	});
}

var players = [],
	queue = [],
	st;


io.sockets.on("connection", function(socket) {
	socket.on("login", function(name) {
		if (name === 0) { //index.html
			socket.join("playing");
		} else {
			console.log("logged in, players length: " + players.length);
			if (players.indexOf(name) == -1) {
				socket.set("nick", name);
				if (players.length < 2) {
					players.push(name);
					console.log("added new player, " + name);
					io.sockets.in("playing").emit("newPlayer", name, players.length - 1);
					socket.join("playing");
					socket.emit("connection", true, 1, players.length);
				} else {
					socket.emit("connection", false, 3, queue.length + 1);
					socket.join("queue");
					queue.push(name);
					setupTimeout();
				}
			} else {
				socket.emit("connection", false, 2, "brukernavnet er allerede tatt");
				socket.disconnect();
			}
		}
	});
	
	function setupTimeout() {
		clearTimeout(st);
		st = null;
		console.log("setting up kickout, queue length: " + queue.length);
		if (queue.length > 0)
			st = setTimeout(kickPlayer, 10000);
	}
	
	function resetTimeout() {
		clearTimeout(st);
		st = null;
	}
	
	function kickPlayer() {
		var player = players[0];
		console.log("kicking player: " + player)
		var playerSocket = getSocketByUsername(player);
		playerSocket.emit("gameover");
	}
	
	function getSocketByUsername(username) {
		var allSockets = io.sockets.clients();
		for (var i = 0; i < allSockets.length; i++) {
			var found = false;
			var playerSocket = allSockets[i].get("nick", function(err, name) {
				console.log("getting player (" + username + ") by nick: '" + name + "'");
				if (name == username) {
					console.log("found: " + allSockets[i]);
					found = true;
				}
			});
			console.log("found player " + username + "? " + found);
			if (found)
				return playerSocket;
		}
	}
	
	socket.on("shoot", function (power) {
	    getPlayerNum(socket, function (playerNum) {
			socket.broadcast.emit("shoot", playerNum, power);
		});
	});
	
	socket.on("aim", function (change, aim) {
	    getPlayerNum(socket, function (playerNum) {
			socket.broadcast.emit("aim", playerNum, change, aim);
		});
    });

	socket.on("hit", function (isHit, playerHit, playerShot) {
        //keep track of score
	    socket.broadcast.emit("hit", isHit, playerHit, playerShot);
    });

	function getPlayerNum(socket, callback) {
	    socket.get("nick", function (err, name) {
	        if (!err) {
	            var playerNum = players.indexOf(name);
	            callback(playerNum);
	        }
	    });
	}
	
	socket.on("disconnect", function() {
		console.log("disconnecting");
		var player = socket.get("nick", function(err, name) {
			console.log("error: " + err);
			console.log("name: " + name);
			if (!err && name != null) {
				console.log("diconnection player, " + name);
				players.splice(players.indexOf(name), 1);
				io.sockets.in("playing").emit("removePlayer", name);
				console.log("players length, " + players.join(", "));
				console.log("resetting");
				io.sockets.in("playing").emit("reset", true);
				nextPlayer();
			}
		});
    });

	function nextPlayer() {
	    console.log("nextPlayer(), queue length: " + queue.length);
	    if (queue.length > 0) {
	        var newPlayer = queue.splice(0, 1)[0];
	        console.log("setting up next player in queue: " + newPlayer);
	        players.push(newPlayer);
	        io.sockets.in("playing").emit("newPlayer", newPlayer, 1, players[0]);
	        var queueSocket = getSocketByUsername(newPlayer);
	        queueSocket.leave("queue");
	        queueSocket.join("playing");
	        queueSocket.emit("connection", true, 1, players.length);
	        io.sockets.in("queue").emit("queueChange", queue.length);

			resetTimeout();
			if (queue.length > 0)
	        	setupTimeout();
	    }
	}
});
