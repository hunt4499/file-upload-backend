const AWS = require('aws-sdk');
const { AWS_BUCKET_NAME, AWS_ACCESS_KEY, AWS_SECRET_KEY } = require('../config/config');

const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
});

const uploadToS3 = async (file) => {
    console.log({AWS_ACCESS_KEY,
        AWS_SECRET_KEY,AWS_BUCKET_NAME})
  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key: `uploads/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const result = await s3.upload(params).promise();
  return result.Location;
};

const deleteFromS3 = async (filePath) => {
    const params = {
      Bucket: AWS_BUCKET_NAME, 
      Key: filePath,
    };
  
    try {
      await s3.deleteObject(params).promise();
    } catch (error) {
      throw new Error('Error deleting file from S3: ' + error.message);
    }
  };

module.exports = { uploadToS3 ,deleteFromS3};