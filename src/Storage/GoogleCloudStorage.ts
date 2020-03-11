/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import { Readable } from 'stream';
import { Storage as GCSDriver, StorageOptions, Bucket, File } from '@google-cloud/storage';
import Storage from './Storage';
import { isReadableStream, pipeline } from '../utils';
import { Response, ExistsResponse, ContentResponse, SignedUrlResponse, SignedUrlOptions, StatResponse } from '../types';
import { FileNotFound, PermissionMissing, UnknownException, AuthorizationRequired, WrongKeyPath } from '../Exceptions';

function handleError(err: Error & { code?: number | string }, path: string): never {
	switch (err.code) {
		case 401:
			throw new AuthorizationRequired(err, path);
		case 403:
			throw new PermissionMissing(err, path);
		case 404:
			throw new FileNotFound(err, path);
		case 'ENOENT':
			throw new WrongKeyPath(err, path);
		default:
			throw new UnknownException(err, String(err.code), path);
	}
}

export class GoogleCloudStorage extends Storage {
	protected $config: GoogleCloudStorageConfig;
	protected $driver: GCSDriver;
	protected $bucket: Bucket;

	public constructor(config: GoogleCloudStorageConfig) {
		super();
		this.$config = config;
		const GCSStorage = require('@google-cloud/storage').Storage;
		this.$driver = new GCSStorage(config);
		this.$bucket = this.$driver.bucket(config.bucket);
	}

	private _file(path: string): File {
		return this.$bucket.file(path);
	}

	/**
	 * Use a different bucket at runtime.
	 * This method returns a new instance of GoogleCloudStorage.
	 */
	public bucket(name: string): GoogleCloudStorage {
		const newStorage = new GoogleCloudStorage(this.$config);
		newStorage.$bucket = newStorage.$driver.bucket(name);
		return newStorage;
	}

	/**
	 * Copy a file to a location.
	 */
	public async copy(src: string, dest: string): Promise<Response> {
		const srcFile = this._file(src);
		const destFile = this._file(dest);

		try {
			const result = await srcFile.copy(destFile);
			return { raw: result };
		} catch (e) {
			return handleError(e, src);
		}
	}

	/**
	 * Delete existing file.
	 */
	public async delete(location: string): Promise<Response> {
		try {
			const result = await this._file(location).delete();
			return { raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns the driver.
	 */
	public driver(): GCSDriver {
		return this.$driver;
	}

	/**
	 * Determines if a file or folder already exists.
	 */
	public async exists(location: string): Promise<ExistsResponse> {
		try {
			const result = await this._file(location).exists();
			return { exists: result[0], raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns the file contents.
	 */
	public async get(location: string, encoding = 'utf-8'): Promise<ContentResponse<string>> {
		try {
			const result = await this._file(location).download();
			return { content: result[0].toString(encoding), raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns the file contents as Buffer.
	 */
	public async getBuffer(location: string): Promise<ContentResponse<Buffer>> {
		try {
			const result = await this._file(location).download();
			return { content: result[0], raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns signed url for an existing file.
	 */
	public async getSignedUrl(location: string, options: SignedUrlOptions = {}): Promise<SignedUrlResponse> {
		const { expiry = 900 } = options;
		try {
			const result = await this._file(location).getSignedUrl({
				action: 'read',
				expires: Date.now() + expiry * 1000,
			});
			return { signedUrl: result[0], raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns file's size and modification date.
	 */
	public async getStat(location: string): Promise<StatResponse> {
		try {
			const result = await this._file(location).getMetadata();
			return {
				size: Number(result[0].size),
				modified: new Date(result[0].updated),
				raw: result,
			};
		} catch (e) {
			return handleError(e, location);
		}
	}

	/**
	 * Returns the stream for the given file.
	 */
	public getStream(location: string): Readable {
		return this._file(location).createReadStream();
	}

	/**
	 * Returns URL for a given location. Note this method doesn't
	 * validates the existence of file or it's visibility
	 * status.
	 */
	public getUrl(location: string): string {
		return `https://storage.cloud.google.com/${this.$bucket.name}/${location}`;
	}

	/**
	 * Move file to a new location.
	 */
	public async move(src: string, dest: string): Promise<Response> {
		const srcFile = this._file(src);
		const destFile = this._file(dest);

		try {
			const result = await srcFile.move(destFile);
			return { raw: result };
		} catch (e) {
			return handleError(e, src);
		}
	}

	/**
	 * Creates a new file.
	 * This method will create missing directories on the fly.
	 */
	public async put(location: string, content: Buffer | Readable | string): Promise<Response> {
		const file = this._file(location);

		try {
			if (isReadableStream(content)) {
				const destStream = file.createWriteStream();
				await pipeline(content, destStream);
				return { raw: undefined };
			}

			const result = await file.save(content, { resumable: false });
			return { raw: result };
		} catch (e) {
			return handleError(e, location);
		}
	}
}

export interface GoogleCloudStorageConfig extends StorageOptions {
	bucket: string;
}
