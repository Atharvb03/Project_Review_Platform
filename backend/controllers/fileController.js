import AWS from 'aws-sdk';

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

export const uploadFileToS3 = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `uploads/${Date.now()}_${req.file.originalname}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const result = await s3.upload(params).promise();
        res.status(200).json({
            message: 'File uploaded successfully',
            url: result.Location
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'S3 upload failed', error });
    }
};
