// Just a note here on how I fixed the issue of "Error: Can't send mail - all recipients were rejected: 454 4.7.1"
// The reason for this is that the postfix server wasn't able to authenticate the nodejs application 
// The solution is to enable the tls option in transporter to rejectUnauthorized:false and go to /etc/postfix/main.cf and add the public ip of this server to mynetwork
const fs = require('fs');
const express = require("express");
var session = require('express-session');
var nodemailer = require('nodemailer');
var rand = require('random-key');
const {MongoClient} = require("mongodb");
const Jimp = require('jimp');
const app = express();
const port = 80;
const ip_address = '209.151.152.82'; // the public ip address of server so it can receive requests from the internet rather than only local host
const uri =
"mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.1.5&ssl=false"
const client = new MongoClient(uri); // creates the client to interact with the mongodb database
const CSE356ID  = '65e148778849cf2582029a74';
const transporter = nodemailer.createTransport({
	host: ip_address,
	service: 'postfix',
	port: 25,
	secure: false,
	tls: {
          rejectUnauthorized: false
      }
});

var is_login=true;

app.use('/leaflet', express.static(__dirname + '/node_modules/leaflet/dist'));
app.use(session({ secret: 'keyboard cat', cookie: { maxAge: 600000 }, resave: false, saveUninitialized:true}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
	console.log('index')
	if(req.session.username){
		res.sendFile(__dirname + '/index.html');
	}else{
		return res.status(200).json({status: "ERROR"});
	}
  });

function encodePlus(url) {
    return url.replace(/ /g, '+');
}

// this should create the user and send a verification email to the user
app.post('/adduser', async function(req,res){
	console.log('adduser')
	const username = req.body.username;
	const password = req.body.password;
	const email = encodePlus(req.body.email);
	console.log(email);
	const collection = client.db('birdinspace').collection('account');
	const query = {username: username, email: email};
	if(await collection.findOne(query)){
		res.set('X-CSE356', CSE356ID);
		return res.status(200).json({Error: "user already created", status:"ERROR"});
	}
	const key = rand.generate();
	const document = {username: username, password: password, email: email, isVerify: false, key: key};
	const result = await collection.insertOne(document);

	const verifyLink = `http://${ip_address}/verify?email=${email}&key=${key}`;
	let mailOption = {
		from : 'root@cse356.compas.cs.stonybrook.edu',
		to: email,
		subject: 'CSE356 Verification',
		text: `Click the link to verify your account :), ${verifyLink}`
	};
	transporter.sendMail(mailOption,(err ,info) => {
		if(err){
			console.log("error sending email:", err);
		}else{
			console.log("success sending email:",info);
		}
	});
	res.set("X-CSE356", CSE356ID);
	res.status(200).json({result: result,status:"OK"});
});

app.get('/test',function(req,res){
	console.log('test')
	res.status(200).send("hello world");
})

app.get('/verify', async function(req,res){
	console.log('verify')
	const email = encodePlus(req.query.email);
	const key = req.query.key;
	const document = {email: email, key: key};
	const collection = client.db('birdinspace').collection('account');
	const result = await collection.findOne(document);
	res.set("X-CSE356", CSE356ID);
	if(result){
		await collection.updateOne({email:email, key:key},{$set : {isVerify:true}});
		return res.status(200).json({status:"OK"});
	}else{
		return res.status(200).json({status:"ERROR"});
	}
});

app.post('/login', async function(req,res){
		console.log('login')
        const username = req.body.username;
        const password = req.body.password;

        const document = {username: username, password: password};
        const collection = client.db('birdinspace').collection('account');
        const result = await collection.findOne(document);
        res.set("X-CSE356", CSE356ID);
		
		is_login=true;
        if(result){
                req.session.username = username;
		return res.status(200).json({status: "OK"});
        }else{
                return res.status(200).json({status: "ERROR"});
        }
})

app.post('/logout', async function(req,res){
		console.log('logout')
		
		is_login=false;
        if(req.session.username){
                req.session.username = null;
		return res.status(200).json({status: "OK"});
        }else{
                return res.status(200).json({status: "ERROR"});
        }
})


app.get('/tiles/l:z/:y/:x.jpg',async (req, res) => {
	const z = req.params.z;
	const y = parseInt(req.params.y)+1;
	const x = parseInt(req.params.x)+1;
	const style = req.query.style;
	if(!is_login){
		return res.status(400).json({ status: 'ERROR', message: 'Not Logged in' });
	}
	// Validate the z, y, x, and style parameters
	if (z < 1 || z > 8 || isNaN(y) || isNaN(x) || (style !== 'color' && style !== 'bw')) {
	  res.set('X-CSE356', CSE356ID);
	  return res.status(400).json({ status: 'ERROR', message: 'Invalid parameters' });
	}
  
	const imagePath = `/root/server/wp2/tiles/l${z}/${y}/${x}.jpg`;
	const imagePathColor =`/root/server/wp2/tiles/l${z}/${y}/${x}${style==='color'? '':"_bw"}.jpg`;

	const now = new Date();
	const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

	if (!fs.existsSync(imagePath)) {
		console.log(`[${timestamp}] no image ${imagePath}`)
		res.set('X-CSE356', CSE356ID);
		return res.status(404).json({ status: 'ERROR', message: 'Image not found' });
	}
	console.log(`[${timestamp}] ${imagePath}`)

	if(style=='color'){
	}
	else{
		if (!fs.existsSync(imagePathColor)) {
			await Jimp.read(imagePath, (err, image) => {
				if (err) throw err;
				image.greyscale().write(imagePathColor);
			});
		}
	}
  
	// Serve the image file
	res.set('X-CSE356', CSE356ID);
	res.sendFile(imagePathColor, { root: '/' });
});



app.listen(port, ip_address, async function(){
	try{

		await client.connect(); // connect to the database
	}catch(e){
		console.log("error", e);
	}	
	console.log(`Server started at ${ip_address}:${port}`);
});

