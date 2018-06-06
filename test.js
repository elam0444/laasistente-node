'use strict';

var dotenv = require('dotenv').config();
var validator = require("email-validator");
var googleMapsClient = require('@google/maps').createClient({
    key: 'AIzaSyA7sr7E8YVw_e17jV3E5j7uPOVV47bZ6TU',
    Promise: Promise
});

// FOR CONFIGURING FRAMEWORK
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');

// FOR CONNECTING TO AN API
const querystring = require('querystring');
const https = require('https');

let senderId;

let user = {
    id: '',
    locale: '',
    timezone: '',
    first_name: '',
    last_name: '',
    profile_pic: '',
    gender: '',
    mulu_user_id: '',
    where: '',
    place_id: '',
    when: '',
    birth_year: 0,
    preference: '',
    email: ''
};

let pendingQuestion = -999;
let quickReplies = [];

var app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 3000));

// Server frontpage
app.get('/', function (req, res) {
    res.send('TestBot Server is Running');
});

// HEALTH CHECK FOR LOAD BALANCER AWS
app.get('/ping.html', function (req, res) {
    //AWS ELB pings this URL to make sure the instance is running
    //smoothly
    res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Length': 2
    });
    res.write('OK');
    res.end();
});

// Handler receiving messages and echoing them. Example from facebook (RENAME TO WEBHOOK)
app.post('/example', function (req, res) {
    var events = req.body.entry[0].messaging;
    for (let i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.message && event.message.text) {
            sendMessage(event.sender.id, {text: "Echo: " + event.message.text});
        }
    }
    res.sendStatus(200);
});

// Facebook Webhook setup
app.get('/webhook', function (req, res) {
    if (req.query['hub.verify_token'] === 'testbot_verify_token') {
        res.send(req.query['hub.challenge']);
    } else {
        res.send('Response: Invalid verify token');
    }
});

// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {
    let body = req.body;

    // Checks this is an event from a page subscription
    if (body.object === 'page') {
        //console.log(body.entry[0].changes);

        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function(entry) {

            // Gets the message. entry.messaging is an array, but
            // will only ever contain one message, so we get index 0
            if (entry.messaging) {
                //console.log(entry.messaging[0].sender);
                let webhook_event = entry.messaging[0];

                //GETTING STARTED
                if (webhook_event.postback && webhook_event.postback.payload === 'GETTING_STARTED') {
                    senderId = webhook_event.sender.id;
                    initUser(senderId);
                } else {
                    // THERE'S A MESSAGE SENT
                    if (webhook_event.message && webhook_event.message.text) {
                        analyzeMessage(webhook_event);
                    }
                }

            }
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }

});

function initUser(senderId){
    if (senderId) {
        let usersPublicProfile = 'https://graph.facebook.com/v2.6/' + senderId + '?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=' +  process.env.PAGE_ACCESS_TOKEN;
        request({
            url: usersPublicProfile,
            json: true
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                user.id = body.id;
                user.first_name = body.first_name;
                user.last_name = body.last_name;
                user.locale = body.locale;
                user.profile_pic = body.profile_pic;
                user.gender = body.gender;

                //getFBMuluSession(user);
                askQuestions(user);
            }
        });
    }
}

function askQuestions(user) {
    sendMessage(user.id, {
        "text": "Hola " + user.first_name + "!, soy Maria LaAsistente",
    });

    sendMessage(user.id, {
        "text": "Te voy a ayudar a resolver tareas cotidianas de tu empresa como despacho de mensajería y documentos, servicios de limpieza, servicios de profesionales especializados como Contadores, Abogados, o cualquier tarea que necesite mucho tiempo. (SELECCIONA UNA OPCIÓN)",
        "quick_replies": [
            {
                "content_type": "text",
                "title": "OK, empecemos",
                "payload": "START_QUESTIONS",
            },
            {
                "content_type": "text",
                "title": "En otro momento",
                "payload": "CANCEL_QUESTIONS",
            },
        ]
    });
}

// Analyze message
function analyzeMessage(webhook_event) { console.log(pendingQuestion);
    let senderId = webhook_event.sender.id;
    let intent =  webhook_event.message;
    let message;

    // QUICK REPLIES
    if (intent.quick_reply) {

        if (pendingQuestion = -999) {
            if (intent.quick_reply.payload === 'START_QUESTIONS') {
                pendingQuestion = 0;
                message = {
                    "text": "Me podrías dar tu dirección correo electrónico? La usamos para notificarte cuando el servicio este en camino."
                };
            }
        }

        if (intent.quick_reply.payload === 'CANCEL_QUESTIONS') {
            message = {
                "text": "Recuerda que luego puedes escribir EMPEZAR_REGISTRO para registrar tus datos"
            };
        }

        if (pendingQuestion === 3) {
            let index = quickReplies.findIndex(item => item.payload === intent.quick_reply.payload);
            if (index !== -1) {
                pendingQuestion = -1;
                user.where = quickReplies[index].title;
                user.place_id = quickReplies[index].payload;
                message = {
                    "text": "Listo ya te registré en nuestro sistema!"
                };
                createTask(senderId);
            } else {
                message = {
                    "text": "Por favor selecciona una opción"
                };
            }
        }

        if (intent.quick_reply.payload === 'READY') {

            pendingQuestion = -2;
            message = {
                "text": "Qué servicio necesitas solicitar?",
                "quick_replies": [
                    {
                        "content_type": "text",
                        "title": "Mensajería y envíos",
                        "payload": "DELIVERY",
                    },
                    {
                        "content_type": "text",
                        "title": "Aseo y servicios de limpieza",
                        "payload": "CLEANING",
                    },
                    {
                        "content_type": "text",
                        "title": "Servicio especializado, profesional",
                        "payload": "PROFESSIONAL",
                    },
                ]
            };
        }

        //if (pendingQuestion === -2) {console.log('here 2');
        if (intent.quick_reply.payload === 'DELIVERY' || intent.quick_reply.payload === 'CLEANING' || intent.quick_reply.payload === 'PROFESSIONAL') {
            pendingQuestion = -3;
            message = {
                "text": "A que domicilio o dirección necesitas el servicio?"
            };
        }
        //}

    }

    // TEXT REPLIES
    if (intent && intent.text && !intent.quick_reply) {
        //console.log(intent.text);

        if (intent.text.includes("EMPEZAR_REGISTRO")) {
            initUser(senderId);
        }

        if (pendingQuestion === -1) {

            createTask(senderId);

        } else if (pendingQuestion === 0) {

            if (validator.validate(intent.text)) {
                pendingQuestion = 1;
                user.email = intent.text;
                message = {
                    "text": "Podrías darnos tu número de telefónico? Así puedo contactarte una vez el servicio esté en camino. Ej: 31653949xx"
                };
            } else {
                message = {
                    "text": "Debes darme una dirección de correo válida para poder ayudarte"
                };
            }

        } else if (pendingQuestion === 1) {

            // VALIDATE PHONE ****
            if (true) {
                user.phone = intent.text;
                pendingQuestion = 2;
                message = {
                    "text": "Super!, eso es todo, ahora estás listo para solicitar una tarea?"
                };
                createTask(senderId);
            } else {
                message = {
                    "text": "Por favor inserta un número telefónico válido"
                };
            }

        } else if (pendingQuestion === 2) {

            googlePlaces(intent.text);

        } else if (pendingQuestion === -3) {

            pendingQuestion = -4;
            user.address = intent.text;
            message = {
                "text": "Cuál es el tiempo de entrega máximo para esta solicitud?"
            };

        } else if (pendingQuestion === -4) {

            if (true) {
                pendingQuestion = -5;
                user.time = intent.text;
                message = {
                    "text": "Podrías describirme especificamente los detalles de tu solicitud?"
                };
            } else {
                message = {
                    "text": "Por favor dinos en cuanto tiempo esperas resuelta esta tarea"
                };
            }

        } else if (pendingQuestion === -5) {

            pendingQuestion = -1;
            user.description = intent.text;
            message = {
                "text": "Listo! Estamos agendando tu solicitud, en unos minutos un agente te llamará!"
            };

        } else {
            createTask(senderId);
        }
    }

    //console.log(user);
    //SEND MESSAGE
    if (message) {
        sendMessage(senderId, message);
    }

}

function createTask(senderId) {
    let message = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "Quieres realizar una solicitud? Selecciona NUEVA TAREA 😉. También uedes seleccionar AJUSTES para cambiar tu información.",
                "buttons": [
                    {
                        "type": "web_url",
                        "url": "https://app.mulutravel.com/travel-pal-profile",
                        "title": "AJUSTES"
                    }
                ]
            }
        },
        "quick_replies": [
            {
                "content_type":"text",
                "title":"NUEVA TAREA",
                "payload":"READY",
                // "image_url":"https://s4.aconvert.com/convert/p3r68-cdx67/cb7is-liukh.png"
            }
        ]
    };

    sendMessage(senderId, message);

    //setFBMuluUser(user);
}

// LOGIN TO MULU API
function login() {
    var options = {
        url: 'https://admin.mulutravel.com/api/mulu_users/login',
        method: 'POST',
        form: { email: "eric@mulutravel.com", password: "123456" },
        headers: {
            'User-Agent': 'request',
            'Content-Type': 'application/json'
        }
    };

    function callback(error, response, body) {
        //console.log(response.body);
        if (!error && response.statusCode === 200) {
            var info = JSON.parse(body);
            //console.log(info);
            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

// START SESSION GET MULU SESSION
function getFBMuluSession(user) {

    var options = {
        url: 'https://admin.mulutravel.com/api/travel-pal/chat-session',
        method: 'POST',
        form: {
            fb_messenger_sender_id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            locale: user.locale,
            profile_pic: user.profile_pic,
            gender: user.gender
        },
        headers: {
            'User-Agent': 'request',
            'Content-Type': 'application/json'
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            let info = JSON.parse(body);
            if (info.data.mulu_user_id) {
                user.mulu_user_id = info.data.mulu_user_id;
                pendingQuestion = -1;
                // START SEARCHING TRAVEL PAL
                searchTravelPal(senderId);
            } else {
                pendingQuestion = -2; // START FROM SCRATCH
                // START ASKING QUESTIONS
                askQuestions(user);
            }

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

function setFBMuluUser(user) {

    //var data = new FormData(user);
    let gender = null;
    if (user.gender === 'male') {
        gender = 1;
    } else if (user.gender === 'female') {
        gender = 2;
    }

    let options = {
        url: 'https://admin.mulutravel.com/api/travel-pal/user',
        method: 'POST',
        form: {
            fb_messenger_sender_id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            locale: user.locale,
            profile_pic: user.profile_pic,
            gender: gender,
            //mulu_user_id: user.mulu_user_id,
            where: user.where,
            place_id: user.place_id,
            when: user.when,
            birth_year: user.birth_year,
            preference: user.preference,
            email: user.email
        },
        headers: {
            'User-Agent': 'request',
            'Content-Type': 'application/json'
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            var info = JSON.parse(body);

            //console.log(info);

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

function pleaseWait(senderId) {
    sendMessage(senderId, { "text": "Please wait..." });
}

// Generic function sending messages
function sendMessage(recipientId, message) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: recipientId},
            message: message,
        }
    }, function(error, response, body){
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });
}

function isYearValid(year) {
    year = parseInt(year);
    if (Number.isInteger(year)) {
        if (year > 1870 && year < 2000) {
            return true;
        }
    }
    return false;
}

function googlePlaces(q) {
    pleaseWait(senderId);

    let quick_replies = [];

    if (q !== '') {
        googleMapsClient.placesAutoComplete({
            input: q,
            language: 'es',
        }).asPromise()
            .then(function(response) {
                response.json.predictions.forEach( function (item) {
                    quick_replies.push({
                        "content_type": "text",
                        "title": item.description,
                        "payload": item.place_id,
                    });
                });

                sendMessage(senderId, {
                    "text": "Por favor selecciona una opción",
                    "quick_replies": quick_replies
                });

                quickReplies = quick_replies;
                pendingQuestion = 3;

            });
    }
}
