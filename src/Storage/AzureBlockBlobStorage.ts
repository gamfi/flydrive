/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 * @author Christopher Chrapka <krzysztof.chrapka gamfi pl>
 */
import { Storage } from "./Storage";
import {
    BlobSASPermissions,
    BlobServiceClient,
    BlockBlobClient, ContainerClient,
    generateBlobSASQueryParameters, RestError, StorageSharedKeyCredential
} from "@azure/storage-blob";
import {Readable, PassThrough} from "stream";
import {
    ContentResponse,
    DeleteResponse,
    ExistsResponse,
    FileListResponse,
    Response,
    SignedUrlOptions,
    SignedUrlResponse,
} from "../types";
import {isReadableStream} from "../utils";
import {streamToBuffer} from "../utils/streamToBuffer";
import {AuthorizationRequired, FileNotFound, UnknownException, InvalidInput} from "../Exceptions";

export interface AzureBlobStorageConfig {
    container: string;
    connectionString: string;
}

export class AzureBlockBlobStorage extends Storage
{
    constructor(private readonly $containerClient: ContainerClient) {
        super();
    }

    static fromConfig(config: AzureBlobStorageConfig): AzureBlockBlobStorage {
        return new AzureBlockBlobStorage(
            BlobServiceClient
                .fromConnectionString(config.connectionString)
                .getContainerClient(config.container),
        );
    }

    async copy(src: string, dest: string): Promise<Response> {
        const destBlobClient = this.blockBlobClient(dest);
        const sourceUrl = await this.getSignedUrl(src);

        try {
            return {
                raw: await destBlobClient.syncCopyFromURL(
                    sourceUrl.signedUrl,
                ),
            };
        } catch (e) {
            throw this.convertError(e);
        }
    }

    async delete(location: string): Promise<DeleteResponse> {
        const blockBlobClient = this.blockBlobClient(location);
        let raw;
        let wasDeleted = true;

        try {
            raw = await blockBlobClient.delete();
        } catch (e) {
            raw = e;
            e = this.convertError(e);

            if (e instanceof FileNotFound) {
                wasDeleted = false;
            } else {
                throw e;
            }
        }

        return {raw, wasDeleted};
    }

    async exists(location: string): Promise<ExistsResponse> {
        const blockBlobClient = this.blockBlobClient(location);
        try {
            const response = await blockBlobClient.exists();

            return {
                exists: response,
                raw: response,
            };
        } catch (e) {
            throw this.convertError(e);
        }
    }

    async getBuffer(location: string): Promise<ContentResponse<Buffer>> {
        const blockBlobClient = this.blockBlobClient(location);

        try {
            const downloaded = await blockBlobClient.download();
            const buffer = Buffer.alloc(downloaded.contentLength || 0);
            await streamToBuffer(downloaded.readableStreamBody as Readable, buffer, 0, buffer.length);

            return {
                raw: downloaded,
                content: buffer,
            };
        } catch (e) {
            throw this.convertError(e);
        }
    }

    getStream(location: string): Readable {
        const stream = new PassThrough();

        (async (): Promise<void> => {
            try {
                const blockBlobClient = this.blockBlobClient(location);
                const downloaded = (await blockBlobClient.download()).readableStreamBody as Readable;

                downloaded.pipe(stream);
                downloaded.on('error', (e) => stream.destroy(this.convertError(e)));
            } catch (e) {
                stream.emit('error', this.convertError(e));
            }
        })();

        return stream;
    }

    async getSignedUrl(location: string, options?: SignedUrlOptions): Promise<SignedUrlResponse> {
        const expiry = options && options.expiry || 3600;
        const container = this.$containerClient.containerName;
        const startsOn = new Date();
        const expiresOn = new Date(new Date().valueOf() + expiry * 1000);
        const client = this.blockBlobClient(location);

        const token = await generateBlobSASQueryParameters(
            {
                containerName: container,
                blobName: location,
                permissions: BlobSASPermissions.parse("r"), // Required
                startsOn, // Required
                expiresOn, // Optional
            },
            this.$containerClient.credential as StorageSharedKeyCredential,
        );

        return {
            signedUrl: `${client.url}?${token.toString()}`,
            raw: token,
        }
    }

    async move(src: string, dest: string): Promise<Response> {
        const srcBlobClient = this.blockBlobClient(src);
        try {
            const copyResponse = await this.copy(src, dest);

            return {
                raw: {
                    copy: copyResponse.raw,
                    delete: await srcBlobClient.delete(),
                },
            };
        } catch (e) {
            throw this.convertError(e);
        }
    }

    async put(location: string, content: Buffer | Readable | string): Promise<Response> {
        const blockBlobClient = this.blockBlobClient(location);
        let contentLength = 0;
        let result: Response|null = null;

        try {
            if (Buffer.isBuffer(content) || typeof content === "string") {
                contentLength = Buffer.byteLength(content);
                result = {
                    raw: await blockBlobClient.upload(content, contentLength),
                };
            } else if (isReadableStream(content)) {
                result = {
                    raw: await blockBlobClient.uploadStream(content, undefined, undefined),
                };
            }
        } catch (e) {
            throw this.convertError(e);
        }

        if (!result) {
            throw new InvalidInput(
                'content',
                'AzureBlobStorage#put',
                'only Buffers, ReadableStreams and strings are supported'
            );
        }

        return result;
    }

    private blockBlobClient(location: string): BlockBlobClient {
        return this.$containerClient.getBlockBlobClient(location);
    }

    private convertError(e: RestError): Error {
        const errorCode = e.response && e.response.parsedHeaders && e.response.parsedHeaders.errorCode || e.statusCode;
        const url = e.request && e.request.url || '';

        if (errorCode === 'BlobNotFound') {
            return new FileNotFound(e, url);
        } else if (errorCode === 'AuthenticationFailed') {
            return new AuthorizationRequired(e, url);
        }

        return new UnknownException(e, errorCode, url);
    }

    async *flatList(prefix: string): AsyncIterable<FileListResponse> {
        for await (const blob of this.$containerClient.listBlobsFlat({prefix})) {
            yield {
                path: blob.name,
            }
        }
    }
}
