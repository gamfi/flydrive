/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import { Readable } from 'stream';
import { dirname, join, resolve, relative } from 'path';
import fse from 'fs-extra';
import fs from 'fs';

import { Storage } from './Storage';
import { FileNotFound, UnknownException, PermissionMissing, InvalidInput } from '../Exceptions';
import { isReadableStream, pipeline } from '../utils';
import {
	Response,
	ExistsResponse,
	ContentResponse,
	StatResponse,
	FileListResponse,
	DeleteResponse
} from '../types';
import {promisify} from "util";

function handleError(err: Error & { code: string; path?: string }, fullPath: string): Error {
	switch (err.code) {
		case 'E_FILE_NOT_FOUND':
		case 'ENOENT':
			return new FileNotFound(err, err.path || fullPath);
		case 'EPERM':
			return new PermissionMissing(err, err.path || fullPath);
		default:
			return new UnknownException(err, err.code, err.path || fullPath);
	}
}

export class LocalStorage extends Storage {
	private $root: string;

	constructor(config: LocalFileSystemConfig) {
		super();
		this.$root = resolve(config.root);
	}

	static fromConfig(config: LocalFileSystemConfig): Storage {
		return new LocalStorage(config);
	}

	/**
	 * Returns full path to the storage root directory.
	 */
	private _fullPath(relativePath: string): string {
		return join(this.$root, join('/', relativePath));
	}

	/**
	 * Copy a file to a location.
	 */
	public async copy(src: string, dest: string): Promise<Response> {
		const srcPath = this._fullPath(src);

		try {
			const result = await fse.copy(srcPath, this._fullPath(dest));
			return { raw: result };
		} catch (e) {
			throw handleError(e, srcPath);
		}
	}

	/**
	 * Delete existing file.
	 */
	public async delete(location: string): Promise<DeleteResponse> {
		const fullPath = this._fullPath(location);
		let wasDeleted: boolean = true;

		try {
			await fse.unlink(fullPath);
		} catch (e) {
			e = handleError(e, location);

			if (e instanceof FileNotFound) {
				wasDeleted = false;
			} else {
				throw e;
			}
		}

		return {
			raw: undefined,
			wasDeleted,
		};
	}

	/**
	 * Determines if a file or folder already exists.
	 */
	public async exists(location: string): Promise<ExistsResponse> {
		const fullPath = this._fullPath(location);

		try {
			const result = await fse.pathExists(fullPath);
			return { exists: result, raw: result };
		} catch (e) {
			throw handleError(e, location);
		}
	}

	/**
	 * Returns the file contents as Buffer.
	 */
	public async getBuffer(location: string): Promise<ContentResponse<Buffer>> {
		const fullPath = this._fullPath(location);

		try {
			const result = await fse.readFile(fullPath);
			return { content: result, raw: result };
		} catch (e) {
			throw handleError(e, location);
		}
	}

	/**
	 * Returns file size in bytes.
	 */
	public async getStat(location: string): Promise<StatResponse> {
		const fullPath = this._fullPath(location);

		try {
			const stat = await fse.stat(fullPath);
			return {
				size: stat.size,
				modified: stat.mtime,
				raw: stat,
			};
		} catch (e) {
			throw handleError(e, location);
		}
	}

	/**
	 * Returns a read stream for a file location.
	 */
	public getStream(location: string, options?: ReadStreamOptions | string): fse.ReadStream {
		return fse.createReadStream(this._fullPath(location), options);
	}

	/**
	 * Move file to a new location.
	 */
	public async move(src: string, dest: string): Promise<Response> {
		const srcPath = this._fullPath(src);

		try {
			const result = await fse.move(srcPath, this._fullPath(dest));
			return { raw: result };
		} catch (e) {
			throw handleError(e, src);
		}
	}

	/**
	 * Creates a new file.
	 * This method will create missing directories on the fly.
	 */
	public async put(
		location: string,
		content: Buffer | Readable | string,
	): Promise<Response> {
		let result;
		const fullPath = this._fullPath(location);

		try {
			if (isReadableStream(content)) {
				await fse.ensureDir(dirname(fullPath));
				const ws = fse.createWriteStream(fullPath);
				await pipeline(content, ws);

				result = { raw: undefined };
			} else if (Buffer.isBuffer(content) || typeof(content) === 'string') {
				await fse.ensureDir(dirname(fullPath));
				await fse.writeFile(fullPath, content);

				result = { raw: undefined };
			}
		} catch (e) {
			throw handleError(e, location);
		}

		if (!result) {
			throw new InvalidInput(
				'content',
				'LocalStorage#put',
				'only Buffers, ReadableStreams and strings are supported'
			);
		}

		return result;
	}

	flatList(prefix: string): AsyncIterable<FileListResponse> {
		// no dots, empty path should end with '/', and end '/' is preserved
		return this.flatListAbsolute(this._fullPath(prefix))
	}

	private async *flatListAbsolute(prefix: string): AsyncGenerator<FileListResponse> {
		let prefixDirectory = (prefix[prefix.length-1] === '/') ? prefix : dirname(prefix);

		try {
			for (const file of await promisify(fs.readdir)(prefixDirectory, {withFileTypes: true, encoding: 'utf-8'})) {
				const fileName = join(prefixDirectory, file.name);

				if (fileName.substr(0, prefix.length) === prefix) {
					if (file.isDirectory()) {
						for await (const subFile of this.flatListAbsolute(fileName + '/')) {
							yield subFile;
						}
					} else if (file.isFile()) {
						const path = relative(this.$root, fileName);

						yield {
							path,
						}
					}
				}
			}
		} catch (e) {
			e = handleError(e, e.path);

			if (!(e instanceof FileNotFound)) {
				throw e;
			}
		}
	}
}

export type LocalFileSystemConfig = {
	root: string;
};

export type ReadStreamOptions = {
	flags?: string;
	encoding?: string;
	fd?: number;
	mode?: number;
	autoClose?: boolean;
	start?: number;
	end?: number;
	highWaterMark?: number;
};
