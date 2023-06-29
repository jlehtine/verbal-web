import { BackendRequest, BackendResponse, isBackendRequest } from '../shared/api';
import { createServer } from 'http';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

const server = createServer({}, (req, resp) => {
    try {
        if (req.url === '/query' && req.method === 'POST' && req.headers['content-type'] === 'application/json') {
            // Read and process data
            let data = '';
            req.on('data', (chunk) => {
                data += chunk;
            });
            req.on('end', () => {
                const breq = JSON.parse(data);
                if (isBackendRequest(breq)) {
                    console.log('Received request: ' + breq);
                    const response = 'test response';
                    const bresp: BackendResponse = { response: response };
                    resp.statusCode = StatusCodes.OK;
                    resp.setHeader('content-type', 'application/json');
                    resp.write(JSON.stringify(bresp));
                } else {
                    resp.statusCode = StatusCodes.BAD_REQUEST;
                    resp.setHeader('content-type', 'text/plain');
                    resp.write(ReasonPhrases.BAD_REQUEST);
                }
                resp.end();
            });
        } else {
            throw 'Unknown request';
        }
    } catch (err) {
        console.error('Error occurred: ' + err);
        throw err;
    }
});

server.listen(8080);
