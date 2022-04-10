const express = require('express');
const { S3 } = require("aws-sdk");
const { PrismaClient } = require('@prisma/client');
const handler = require('../middlewares/handler');
const { createClient } = require('redis');
const getWord = require('../helpers/getrandomword');
const { v4: uuidv4 } = require('uuid');

const redisClient = createClient();
const prisma = new PrismaClient();
redisClient.connect();

const router = express.Router();
const s3 = new S3({ 
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ID,
        secretAccessKey: process.env.AWS_KEY,
    },
    signatureVersion: 'v4',
});

// create a s3 bucket params with the bucket in S3_Bucket, expires in 5 minutes
// acl is private, and the content type is application/octet-stream
const s3Params = {
    Bucket: process.env.S3_BUCKET,
    Expires: 300,
    ACL: 'private',
    ContentType: 'application/octet-stream'
};

router.get('/share/ip', async (req, res) => { 
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`ip: ${ip}`);
    try{
        const share = await prisma.share.findFirst({
            where: { shareIP : ip , timestamp:{
                gt: new Date(Date.now() - (1000 * 60 * 3)) // 3 minutes
            } },
            orderBy:{
                timestamp: "desc"
            }
        });
        if(share === null){
            throw 'No share found';
        }
        handler(res, null, share);
    }catch(e){
        handler(res,e, null);
        throw e;
    }
});

router.get('/share/code',async function(req, res, next) {
    const { code } = req.query;
    try {
        // find id from redis cache by code
        const id = await redisClient.get(code);
        if (id === null){
            throw 'Not found';
        }

        const share = await prisma.share.findFirst({
            where: { id }
        });

        if(share === null){
            throw 'Not a valid share code';
        }
        handler(res, null, share);
    }catch(e){
        handler(res,e,null);
        throw e;
    }
});

// Get share file by id then sign a s3 url
router.get('/share/id/:id', async function(req, res, next) {  
    const { id } = req.params;
    try {
        const share = await prisma.share.findFirst({
            where: { id }
        });
        if(share === null){
            throw 'Not a valid share code';
        }

        const url = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: share.content
        });
        handler(res, null, {
            url,
        });
    }catch(e){
        handler(res,e,null);
        throw e;
    }
});


router.post('/share',async function(req, res, next) {
    const { contentType, content, fileName } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const code = getWord();
    try{
        if (contentType === 'FILE'){
            // split the file name a                                                                                                                                                                                                                                                                                                                                                                            nd extension
            const fileNameSplit = fileName.split('.');
            const fileExtension = fileNameSplit[fileNameSplit.length - 1];
            const fileNameWithoutExtension = fileName.replace(`${fileExtension}`, '');
            // create a new file name
            const newFileName = `${fileNameWithoutExtension}-${uuidv4()}.${fileExtension}`;
            // create a new s3 params with the new file name
            const newBucketParams = {
                ...s3Params,
                Key: newFileName
            };
            const signedUrl = await s3.getSignedUrl('putObject', newBucketParams);
            const docs = await prisma.share.create({
                data:{
                    shareIP: ip,
                    contentType,
                    content: newFileName
                }
            });
            // set id to redis cache with respect to code and
            // expire in 3 minutes
            await redisClient.set(code, docs.id,{
                EX: 180
            });
            handler(res,null,{docs, signedUrl, code});
        }else{
            const docs = await prisma.share.create({
                data:{
                    shareIP: ip,
                    contentType: 'TEXT',
                    content: content
                }
            });
            // set id to redis cache with respect to code and
            // expire in 3 minutes
            await redisClient.set(code, docs.id,{
                EX: 180
            });
            handler(res,null,{docs, code});
        }
    }catch(e){
        handler(res,e,null);
        throw e;
    }

});

// delete all share entry by ip
router.delete('/share', async(req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    try{
        const docs = await prisma.share.deleteMany({
            where: {
                shareIP: ip
            }
        });
        handler(res,null,docs);
    }catch(e){
        handler(res,e,null);
        throw e;
    }
})

module.exports = router;
