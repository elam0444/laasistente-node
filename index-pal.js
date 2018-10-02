'use strict';

var dotenv = require('dotenv').config();
var validator = require("email-validator");
var moment = require("moment");

// CRON JOBS
var schedule = require('node-schedule');

// GOOGLE MAPS
var googleMapsClient = require('@google/maps').createClient({
    key: 'AIzaSyA7sr7E8YVw_e17jV3E5j7uPOVV47bZ6TU',
    Promise: Promise
});

// REDIS
var redis = require('redis');
var client = redis.createClient();
var flatten = require('flat');
var unflatten = require('flat').unflatten;


client.on('connect', function () {
    console.log('Redis client connected');
});

client.on('error', function (err) {
    console.log('Something went wrong ' + err);
});

// FOR CONFIGURING FRAMEWORK
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var path = require('path');

// FOR CONNECTING TO AN API
const querystring = require('querystring');
const https = require('https');
const apiUrl = process.env.API_URL;
//const apiUrl = 'http://172.28.128.3:8080/api/';

const month_names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

let user = {
    id: '',
    locale: '',
    timezone: '',
    first_name: '',
    last_name: '',
    profile_pic: '',
    attachment_id: '',
    gender: '',
    mulu_user_id: '',
    where: '',
    place_id: '',
    when: '',
    birth_year: 0,
    preference: '',
    email: '',
    token: ''
};

let session = {
    sender_id: "",
    match_sender_id: "",
    state: -99,
    quick_replies: "",
    guide_id: 0,
    selected_place: "", // FOR CREATING GUIDES
    user: user
};

let senderId;
let matchSenderId;
let state = -99;
let quickReplies = [];

var app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 3000));
// REMOVE IF //CERTIFICATES HTTPS DOES NOT EXIST

// PUBLIC serves this /public/myfile.ext
app.use('/public', express.static(__dirname + '/public'));

//CERTIFICATES HTTPS
/*var fs = require("fs");
var options = {
    ca: fs.readFileSync(path.join(__dirname, 'ssl', 'ca_bundle.crt')),
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'private.key')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'certificate.crt'))
};
https.createServer(options, app).listen((process.env.PORT || 3000));*/

// Server frontpage
app.get('/', function (req, res) {
    res.send('TestBot Server is Running');
});

// TEST
app.get('/.well-known/acme-challenge/B76ysNakp4NFD5qbHm5FBVUK5lFsS6qRV3wVKLxo2zM', function (req, res) {
    res.send('B76ysNakp4NFD5qbHm5FBVUK5lFsS6qRV3wVKLxo2zM');
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

app.get('/test', function (req, res) {

    let place = {
        google_id: 1,
        main_image: 2,
        images: [],
        name: 3,
        latitude: 4,
        longitude: 5,
        address: 6,
        actions: false
    };

    var options = {
        url: apiUrl + 'places',
        method: 'POST',
        qs: place,
        headers: {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjMxMTUsImlzcyI6Imh0dHA6Ly8xNzIuMjguMTI4LjM6ODA4MC9hcGkvbXVsdV91c2Vycy9sb2dpbkJvdCIsImlhdCI6MTUyOTA0MTM4OCwiZXhwIjoxNTMwMjUwOTg4LCJuYmYiOjE1MjkwNDEzODgsImp0aSI6IkxqazJmSHZJb3FKOUFaS3AifQ._lxKcOzBW_t6T5MczuW5nh2bY080oc3Itwh2RvMdlMw'
        }
    };

    function callback(error, response, body) {console.log(body);
        if (!error && response.statusCode === 200) {
            let info = JSON.parse(body);
            console.log(info);

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);

    res.send('Finished');
});

// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {
    let body = req.body;

    // Checks this is an event from a page subscription
    if (body.object === 'page') {

        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function (entry) {

            // Gets the message. entry.messaging is an array, but
            // will only ever contain one message, so we get index 0
            if (entry.messaging) {
                let webhook_event = entry.messaging[0];

                client.hgetall("user:" + webhook_event.sender.id, function (error, result) {
                    let stored = unflatten(result);

                    if (!stored) {
                        stored = session;
                        stored.sender_id = webhook_event.sender.id;
                    }

                    // SAVE SESSION
                    saveSession(stored);
                    // GETTING STARTED
                    main(webhook_event);

                });
            }
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }

});

// INIT APP
let init = (function () {
    let executed = false;
    return function () {
        if (!executed) {
            executed = true;
            initCronJobs();
        }
    };
})();
init();

function main(webhook_event) {
    if (webhook_event.postback && webhook_event.postback.payload === 'GETTING_STARTED') {
        initUser(webhook_event.sender.id);
    } else {
        // THERE'S A MESSAGE SENT
        if (webhook_event.message && webhook_event.message.text) {
            analyzeMessage(webhook_event);
        }

        // THERE'S A POSTBACK
        if (webhook_event.postback && webhook_event.postback.payload) {
            analyzePayload(webhook_event);
        }

    }
}

function askQuestions(user) {
    sendMessage(user.id, {
        "text": "Welcome " + user.first_name + "!,  Let's find a fellow event goer to share experiences with, split expenses & access discounts",
        "quick_replies": [
            {
                "content_type": "text",
                "title": "OK, Let's do it",
                "payload": "START_QUESTIONS",
            },
            {
                "content_type": "text",
                "title": "Cancel",
                "payload": "CANCEL_QUESTIONS",
            },
        ]
    });
}

function validateMonth(intent) {
    let month = '';
    if (intent.nlp.entities.datetime) {
        intent.nlp.entities.datetime[0].values.forEach(function (item) {
            if (item.grain === 'month') {
                let date = new Date(item.value);
                month = month_names[date.getMonth()];
            }
        });
        return month;
    } else {
        return false;
    }
}

function validateDate(intent) {
    let month = ''; let year = ''; let fullDate = '';
    if (intent.nlp.entities.datetime) {
        intent.nlp.entities.datetime[0].values.forEach(function (item) {
            fullDate = new Date(item.value);
            month = month_names[fullDate.getMonth()];
            year = fullDate.getFullYear();
            fullDate = moment(fullDate).format('YYYY-MM-DD HH:mm:ss');
        });
        return fullDate;
    } else {
        return false;
    }
}

function analyzePayload(webhook_event) {

    client.hgetall("user:" + webhook_event.sender.id, function (error, result) {
        let stored = unflatten(result);
        let senderId = webhook_event.sender.id;
        let payload = webhook_event.postback.payload;
        let state = Number(stored.state);
        let message;

        if (state === 13) {
            if (stored.quick_replies) {
                stored.quick_replies = JSON.parse(stored.quick_replies);

                let index = stored.quick_replies.findIndex(item => item.payload === payload);
                if (index !== -1) {
                    stored.state = 11; // SEARCH ANOTHER
                    let place = JSON.parse(stored.selected_place);

                    console.log('hi' + stored.guide_id);

                    if (stored.guide_id === 0) {
                        console.log('create guide');
                        createGuide(stored.user, place);
                    } else {
                        console.log('create place');
                        createPlace(stored.user, place);
                    }

                    message = {
                        "text": "Place saved! You can type another place..."
                    };

                } else if (payload === 'CANCEL_GUIDE') {

                    stored.state = -1;
                    stored.guide_id = 0;
                    console.log('cancel guide');
                    console.log(stored.guide_id);

                    message = {
                        "text": "You have finished"
                    };

                } else {
                    message = {
                        "text": "Please select an option"
                    };
                }
            }
        } else if (state === 14) {

        }

        // UPDATE STORED SESSION
        saveSession(stored);

        //SEND MESSAGE
        if (message) {
            sendMessage(senderId, message);
        }

    });
}

// Analyze message
function analyzeMessage(webhook_event) { console.log(state);

    client.hgetall("user:" + webhook_event.sender.id, function (error, result) {
        let stored = unflatten(result);
        let senderId = webhook_event.sender.id;
        let intent = webhook_event.message;
        let state = Number(stored.state);
        let message;

        // QUICK REPLIES
        if (intent.quick_reply) {
            if (intent.quick_reply.payload === 'START_QUESTIONS') {
                stored.state = 0;
                message = {
                    "text": "What event do you want to attend? Ex. Coachella, Comic con"
                };
            }

            if (intent.quick_reply.payload === 'CANCEL_QUESTIONS') {
                message = {
                    "text": "Remember you can go back and setup your account by typing START_AGAIN"
                };
            }

            if (intent.quick_reply.payload === 'READY_CHAT') {
                stored.state = -2;
                // SET STATE HERE FOR CHAT AND ASKS IF MATCH IS READY
                getActiveFriend(stored, true);
                message = {
                    "text": "You are ready!"
                };
            }

            if (intent.quick_reply.payload === 'CREATE_GUIDE') {
                stored.state = 11;
                message = {
                    "text": "Type a place you love..."
                };
            }

            if (state === 3) {
                if (stored.quick_replies) {
                    stored.quick_replies = JSON.parse(stored.quick_replies);

                    let index = stored.quick_replies.findIndex(item => item.payload === intent.quick_reply.payload);
                    if (index !== -1) {
                        stored.state = 4;
                        stored.user.where = stored.quick_replies[index].title;
                        stored.user.place_id = stored.quick_replies[index].payload;

                        stored.quick_replies = "";
                        message = {
                            "text": "To improve our matching skills, what year were you born? Ex. 1990"
                        };
                    } else {
                        message = {
                            "text": "Please select an option"
                        };
                    }
                }
            }

            if (state === 12) {
                if (stored.quick_replies) {
                    stored.quick_replies = JSON.parse(stored.quick_replies);

                    let index = stored.quick_replies.findIndex(item => item.payload === intent.quick_reply.payload);
                    if (index !== -1) {
                        stored.state = 13;
                        stored.user.where = stored.quick_replies[index].title; // SELECTED WHERE
                        stored.user.place_id = stored.quick_replies[index].payload; // SELECTED PLACE ID

                        sendPlaceOption(stored, stored.user.place_id);

                    } else {
                        message = {
                            "text": "Please select an option"
                        };
                    }
                }
            }

        }

        // TEXT REPLIES
        if (intent && intent.text && !intent.quick_reply) {

            //INIT USER IF STATE IS 99 AND TEXT IS WHATEVER OR USER INPUTS S_A
            if (intent.text.includes("START_AGAIN") || stored.state === -99) {

                initUser(senderId);

                // CHAT READY
            } else if (state === -2) {

                if (intent.text.includes('CANCELPAL') ) {

                    cancelTravelPal(stored);

                } else {
                    // SEND MESSAGES
                    if (!stored.match_sender_id) {
                        // CHECK IF THERE'S A MATCH AND NOTIFIES THE USER
                        initUser(senderId);
                    } else {
                        senderId = stored.match_sender_id;
                        message = {
                            "text": intent.text
                        };
                    }
                }

                // ALWAYS ASK FOR SEARCH TRAVEL PAL IF STATE IS -1
            } else if (state === -1) {

                searchTravelPal(senderId);

            } else if (state === 0) {

                stored.user.preference = intent.text;
                stored.state = 1;
                message = {
                    "text": "Nice! What month is the event taking place? Ex. 27th March 2018, 2nd Aug 2019"
                };

            } else if (state === 1) {

                // VALIDATE MONTH
                if (validateDate(intent) !== false) {
                    stored.user.when = validateDate(intent);
                    stored.state = 2;
                    message = {
                        "text": "Great! What city is it going to be in? Ex. San Diego, Las Vegas"
                    };
                } else {
                    message = {
                        "text": "Please type a valid date. Ex. 27th March 2018, 2nd Aug 2019"
                    };
                }

            } else if (state === 2) {

                googlePlaces(intent.text, stored, 3);

            } else if (state === 4) {

                // VALIDATE YEAR
                if (isYearValid(intent.text)) {
                    stored.user.birth_year = intent.text;
                    stored.state = 5;
                    message = {
                        "text": "Alright! You’re all set, we just need your email to contact you when we find a match! Ex. imawesome@gmail.com"
                    };
                } else {
                    message = {
                        "text": "Please type a valid year. Ex: 1986, 1991, ..."
                    };
                }

            } else if (state === 5) {

                if (validator.validate(intent.text)) {
                    stored.state = -1;
                    stored.user.email = intent.text;
                    setFBMuluUser(stored.user);
                } else {
                    message = {
                        "text": "Can you please provide a valid email address?"
                    };
                }

            } else if (state === 11) {

                googlePlaces(intent.text, stored, 12);

            } else {
                stored.state = -99;
                initUser(senderId);
            }

        }

        if (intent.attachments) {
            let a = intent.attachments;
            message = {text: "Latitude: " + a.payload.coordinates.lat + " - Longitude: " + a.payload.coordinates.long};
        }

        // UPDATE STORED SESSION
        saveSession(stored);

        //SEND MESSAGE
        if (message) {
            sendMessage(senderId, message);
        }

    });


}

function searchTravelPal(senderId) {

    let message = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "Awesome! We will let you know when your EventPal matches are ready 😉. Tap Find EventPal if you are ready or tap on settings for updating your information",
                "buttons": [
                    {
                        "type": "web_url",
                        "url": "https://app.mulutravel.com/travel-pal-profile",
                        "title": "Settings"
                    }
                ]
            }
        },
        "quick_replies": [
            {
                "content_type": "text",
                "title": "Find EventPal",
                "payload": "READY_CHAT",
                "image_url": "https://s4.aconvert.com/convert/p3r68-cdx67/cb7is-liukh.png"
            },
            {
                "content_type": "text",
                "title": "Create Guide",
                "payload": "CREATE_GUIDE"
            }
        ]
    };

    sendMessage(senderId, message);

}

// STARTS ALL CONVERSATIONS AND DECIDES WHETHER ASK FOR QUESTIONS OR CHAT
function initUser(senderId) {
    if (senderId) {
        let usersPublicProfile = 'https://graph.facebook.com/v2.6/' + senderId + '?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=' + process.env.PAGE_ACCESS_TOKEN;

        client.hgetall("user:" + senderId, function (error, result) {
            let stored = unflatten(result);

            request({
                url: usersPublicProfile,
                json: true
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    stored.user.id = body.id;
                    stored.user.first_name = body.first_name;
                    stored.user.last_name = body.last_name;
                    stored.user.locale = body.locale;
                    stored.user.profile_pic = body.profile_pic;
                    stored.user.gender = body.gender;

                    uploadAttachment(senderId, stored.user.profile_pic, 'image');

                    saveSession(stored);

                    getFBMuluSession(stored.user);
                }
            });
        });

    }
}

// START SESSION GET MULU SESSION
function getFBMuluSession(user) {

    var options = {
        url: apiUrl + 'travel-pal/chat-session',
        method: 'POST',
        form: {
            fb_messenger_sender_id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            locale: user.locale,
            profile_pic: user.profile_pic,
            gender: user.gender,
            product_id: 2
        },
        headers: {
            'User-Agent': 'request',
            'Content-Type': 'application/json'
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {

            client.hgetall("user:" + user.id, function (error, result) {
                let stored = unflatten(result);
                let info = JSON.parse(body);

                if (info.data.mulu_user_id) {
                    // SEARCH TRAVEL PAL
                    stored.user.mulu_user_id = info.data.mulu_user_id;
                    stored.user.email = info.data.email; // CHANGE THIS ONE TO USER'S EMAIL
                    stored.user.id = info.data.fb_messenger_sender_id;
                    //stored.user.id = body.fb_messenger_sender_id;

                    // START SEARCHING TRAVEL PAL
                    stored.state = -1; // SEARCH TRAVEL PAL STATE
                    searchTravelPal(stored.sender_id);
                    getToken(stored.user);

                } else {
                    // REGISTER USER FORM QUESTIONS
                    stored.state = -2; // START FROM SCRATCH STATE
                    askQuestions(user);
                }

                // SAVE CHANGES
                saveSession(stored);
            });

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

            // GET USER AGAIN
            getFBMuluSession(user);

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
    sendMessage(senderId, {"text": "Please wait..."});
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
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });
}

// Generic function sending messages
function uploadAttachment(sender_id, file_url, type) {

    let message = {
        "attachment": {
            "type": type,
            "payload": {
                "is_reusable": true,
                "url": file_url
            }
        }
    };

    request({
        url: 'https://graph.facebook.com/v2.6/me/message_attachments',
        qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            message: message,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        } else if (!error) {
            client.hgetall("user:" + sender_id, function (error, result) {
                let stored = unflatten(result);
                stored.user.attachment_id = body.attachment_id;
                saveSession(stored);
            });
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

function googlePlaces(q, session, nextState) {
    pleaseWait(session.sender_id);

    let quick_replies = [];

    if (q !== '') {
        googleMapsClient.placesAutoComplete({
            input: q,
            language: 'en',
            //location: [40.724, -74.013],
            //radius: 5000,
            //components: {country: 'us'}
        }).asPromise()
            .then(function (response) {
                response.json.predictions.forEach(function (item) {
                    quick_replies.push({
                        "content_type": "text",
                        "title": item.description,
                        "payload": item.place_id,
                    });
                });

                sendMessage(session.sender_id, {
                    "text": "Please select an option that matches best to you",
                    "quick_replies": quick_replies
                });

                session.quick_replies = JSON.stringify(quick_replies);
                session.state = nextState;

                saveSession(session);
            });
    }
}

// LOGIN TO MULU API
function getToken(user) {
    let options;

    options = {
        url: apiUrl + 'mulu_users/loginBot',
        method: 'POST',
        form: {email: user.email},
        headers: {
            'User-Agent': 'request',
            'Content-Type': 'application/json'
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {

            client.hgetall("user:" + user.id, function (error, result) {
                let stored = unflatten(result);
                var info = JSON.parse(body);

                // SET TOKEN
                stored.user.token = info.data.token;
                saveSession(stored);

                // GET FRIEND FOR CHAT
                getActiveFriend(stored);
            });

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

// GET FRIENDS FOR CHAT
function getActiveFriend(stored, warning) {
    if (!warning) {
        warning = false;
    }
    var options = {
        url: apiUrl + 'mulu_users/' + stored.user.mulu_user_id + '/matches',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + stored.user.token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            client.hgetall("user:" + stored.sender_id, function (error, result) {
                let stored = unflatten(result);
                var info = JSON.parse(body);

                // CHECKS FOR NEW MATCH IN MYSQL
                if (info.data !== undefined && info.data.length !== 0) {
                    stored.match_sender_id = info.data[0].fb_messenger_sender_id;
                    stored.state = -2;

                    client.hgetall("user:" + stored.match_sender_id, function (error, result) {
                        let stored_match = unflatten(result);
                        // CONNECTS THEM AMONG EACH OTHER
                        stored_match.state = stored.state;
                        stored_match.match_sender_id = stored.sender_id;
                        saveSession(stored_match);

                        sendMessage(stored.sender_id, { "text": "We found " + stored_match.user.first_name + ", say hi!, or type CANCELPAL for leaving" });
                        sendPicture(stored_match.user.attachment_id, stored.sender_id);

                        // FIX THE ISSUE REPEATING MATCHES
                        if (warning === true) {
                            sendMessage(stored_match.sender_id, { "text": "We found " + stored.user.first_name + ", say hi!, or type CANCELPAL for leaving" });
                            sendPicture(stored.user.attachment_id, stored_match.sender_id);
                        }
                    });

                    saveSession(stored);
                } else if ((info.data === undefined || info.data.length === 0) && warning === true) {
                    sendMessage(stored.sender_id, {"text": "We're still looking for your EventPal... "});
                }

            });

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

function createTemplate(payload_id, title, image_url, subtitle) {
    return {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [
                    {
                        "title": title,
                        "image_url": image_url,
                        "subtitle": subtitle,
                        "buttons":[
                            {
                                "type":"postback",
                                "title":"Save & Continue",
                                "payload":payload_id,
                            },{
                                "type":"postback",
                                "title":"Cancel & Exit",
                                "payload":"CANCEL_GUIDE"
                            }
                        ]
                    }
                ]
            }
        }
    };
}

function sendPlaceOption(session, place_id) {
    let place = {
        google_id: '',
        place_id: '',
        main_image: '',
        images: [],
        name: '',
        latitude: '',
        longitude: '',
        formatted_address: '',
        icon: '',
        utc_offset: '',
        opening_hours: {},
        reviews: [],
        types: [],
        url: '',
        international_phone_number: '',
        actions: false
    };

    googleMapsClient.place({
        placeid: place_id,
        language: 'en',
    }).asPromise()
        .then(function (response) {
            place.google_id = response.json.result.id;
            place.place_id = place_id;
            place.name = response.json.result.name;
            place.formatted_address = response.json.result.formatted_address;
            place.latitude = response.json.result.geometry.location.lat;
            place.longitude = response.json.result.geometry.location.lng;
            place.icon = response.json.result.icon;
            place.utc_offset = response.json.result.utc_offset;
            place.opening_hours = response.json.result.opening_hours;
            place.reviews = response.json.result.reviews;
            place.rating = response.json.result.rating;
            place.reference = response.json.result.reference;
            place.types = response.json.result.types;
            place.url = response.json.result.url;
            place.international_phone_number = response.json.result.international_phone_number;

            // MAIN IMAGE
            googleMapsClient.placesPhoto({
                photoreference: response.json.result.photos[0].photo_reference,
                maxwidth: 300,
                maxheight: 300
            }).asPromise()
                .then(function (response) {
                    place.main_image = "https://lh3.googleusercontent.com" + response.req.path;
                    console.log(place.main_image);
                    let message = createTemplate(place_id, place.name, place.main_image, place.formatted_address);
                    sendMessage(session.sender_id, message);
                });

            // PICTURES
            response.json.result.photos.forEach(function (item) {
                googleMapsClient.placesPhoto({
                    photoreference: item.photo_reference,
                    maxwidth: 300,
                    maxheight: 300
                }).asPromise()
                    .then(function (response) {
                        let image_url = "https://lh3.googleusercontent.com" + response.req.path;
                        place.images.push({image: image_url});

                        session.selected_place = JSON.stringify(place);
                        saveSession(session);
                    });
            });

        });
}

// GET FRIENDS FOR CHAT
function cancelTravelPal(stored) {
    var options = {
        url: apiUrl + 'mulu_users/' + stored.user.mulu_user_id + '/matches/' + stored.match_sender_id,
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + stored.user.token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            client.hgetall("user:" + stored.sender_id, function (error, result) {
                let stored = unflatten(result);
                let info = JSON.parse(body);

                client.hgetall("user:" + stored.match_sender_id, function (error, result) {
                    let stored_match = unflatten(result);

                    stored.state = -1;
                    stored.match_sender_id = "";
                    saveSession(stored);
                    sendMessage(stored.sender_id, { "text": "You have unmatched your EventPal" });
                    searchTravelPal(stored.sender_id);

                    stored_match.state = -1;
                    stored_match.match_sender_id = "";
                    saveSession(stored_match);
                    sendMessage(stored_match.sender_id, { "text": "Your EventPal finished the conversation. We're searching a new EventPal..." });
                    searchTravelPal(stored_match.sender_id);

                });

            });

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

function sendPicture(attachment_id, sender_id) {
    sendMessage(sender_id, {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "media",
                "elements": [
                    {
                        "media_type": "IMAGE",
                        "attachment_id": attachment_id
                    }
                ]
            }
        }
    });
}

function createGuide(user, place) {

        var options = {
            url: apiUrl + 'travels',
            method: 'POST',
            form: {name: 'test-guide'},
            headers: {
                'User-Agent': 'request',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + user.token
            }
        };

        function callback(error, response, body) {
            if (!error && response.statusCode === 200) {
                client.hgetall("user:" + user.id, function (error, result) {
                    let stored = unflatten(result);
                    let info = JSON.parse(body);
                    stored.guide_id = info.data.id;

                    createPlace(stored.user, place);

                    saveSession(stored);
                });

                if (error) {
                    console.log('Error sending message: ', error);
                } else if (response.body.error) {
                    console.log('Error: ', response.body.error);
                }
            }
        }

        request(options, callback);
}

function createPlace(user, place) {
    var options = {
        url: apiUrl + 'places',
        method: 'POST',
        qs: place,
        headers: {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + user.token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            client.hgetall("user:" + user.id, function (error, result) {
                let stored = unflatten(result);
                let info = JSON.parse(body);
                console.log(info);
            });

            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        }
    }

    request(options, callback);
}

function hsetValue(key, hash, value) {
    client.hset([key, hash, value], function (err) {
        if (err) return console.log(err);
    });
}

function saveSession(session) {
    let redisKey = "user:" + session.sender_id;
    let flatSession = flatten(session);

    Object.keys(flatSession).map(function (hash, index) {
        hsetValue(redisKey, hash, flatSession[hash]);
    });
}

// CRON JOBS
function initCronJobs() {
    let j = schedule.scheduleJob('*/60 * * * * *', function () {

        client.keys('*', function (err, keys) { // HERE IS THE ERROR
            if (err) return console.log(err);
            for (let i = 0, len = keys.length; i < len; i++) {

                client.hgetall(keys[i], function (error, result) {
                    let stored = unflatten(result);

                    if (!stored.match_sender_id) {
                        getActiveFriend(stored);
                    } else {
                        //console.log("there is a match");
                    }

                });

            }
        });

    });
}

