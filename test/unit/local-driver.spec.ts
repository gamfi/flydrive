/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import test from 'japa';
import path from 'path';
import fs from 'fs-extra';

import * as CE from '../../src/Exceptions';
import { LocalStorage } from '../../src/Storage/LocalStorage';
import {streamToString} from "../../src/utils/streamToString";

let storage: LocalStorage;

function isWindowsDefenderError(error: { code: string }): boolean {
	return error.code === 'EPERM';
}

function realFsPath(relativePath: string): string {
	return path.join(process.cwd(), `./test/unit/storage/${relativePath}`);
}

test.group('Local Driver', (group) => {
	group.before(async () => {
		await fs.ensureDir(path.join(__dirname, 'storage'));
		storage = new LocalStorage({ root: path.join(__dirname, 'storage') });
	});

	group.afterEach(async () => {
		await fs.emptyDir(path.join(__dirname, 'storage'));
	});

	test('find if a file exist', async (assert) => {
		await fs.outputFile(realFsPath('i_exist'), '');
		const { exists } = await storage.exists('i_exist');
		assert.isTrue(exists);
	});

	test(`find if a file doesn't exist`, async (assert) => {
		const { exists } = await storage.exists('i_dont_exists');
		assert.isFalse(exists);
	});

	test('find if a folder exist', async (assert) => {
		await fs.ensureDir(realFsPath('test_dir'));
		const { exists } = await storage.exists('test_dir');
		assert.isTrue(exists);
	});

	test('create a file', async (assert) => {
		await storage.put('im_new', 'im_new');
		const { content } = await storage.get('im_new');
		assert.equal(content, 'im_new');
	});

	test('create a file in a deep directory', async (assert) => {
		await storage.put('deep/directory/im_new', 'im_new');
		const { content } = await storage.get('deep/directory/im_new');
		assert.equal(content, 'im_new');
	});

	test('delete a file', async (assert) => {
		await fs.outputFile(realFsPath('i_will_be_deleted'), '');

		try {
			await storage.delete('i_will_be_deleted');
			const { exists } = await storage.exists('i_will_be_deleted');
			assert.isFalse(exists);
		} catch (error) {
			if (!isWindowsDefenderError(error)) {
				throw error;
			}
		}
	});

	test(`delete a file that doesn't exist`, async (assert) => {
		assert.plan(1);
		try {
			await storage.delete('i_dont_exist');
		} catch (error) {
			assert.instanceOf(error, CE.FileNotFound);
		}
	});

	test('move a file', async (assert) => {
		await fs.outputFile(realFsPath('i_will_be_renamed'), '');

		await storage.move('i_will_be_renamed', 'im_renamed');

		const { exists: newExists } = await storage.exists('im_renamed');
		assert.isTrue(newExists);

		const { exists: oldExists } = await storage.exists('i_will_be_renamed');
		assert.isFalse(oldExists);
	});

	test('copy a file', async (assert) => {
		await fs.outputFile(realFsPath('i_will_be_copied'), '');

		await storage.copy('i_will_be_copied', 'im_copied');

		const { exists: newExists } = await storage.exists('im_copied');
		assert.isTrue(newExists);

		const { exists: oldExists } = await storage.exists('i_will_be_copied');
		assert.isTrue(oldExists);
	});

	test('prepend to a file', async (assert) => {
		await fs.outputFile(realFsPath('i_have_content'), 'world');

		await storage.prepend('i_have_content', 'hello ');
		const { content } = await storage.get('i_have_content');
		assert.equal(content, 'hello world');
	});

	test('append to a file', async (assert) => {
		await fs.outputFile(realFsPath('i_have_content'), 'hello');

		await storage.append('i_have_content', ' universe');
		const { content } = await storage.get('i_have_content');
		assert.equal(content, 'hello universe');
	});

	test('prepend to new file', async (assert) => {
		await storage.prepend('i_have_content', 'hello');
		const { content } = await storage.get('i_have_content', 'utf-8');
		assert.equal(content, 'hello');
	});

	test('throw file not found exception when unable to find file', async (assert) => {
		assert.plan(1);
		try {
			await storage.get('non_existing', 'utf-8');
		} catch (error) {
			assert.instanceOf(error, CE.FileNotFound);
		}
	});

	test('do prepend root path when path itself is absolute', async (assert) => {
		const dummyFile = '/dummy_file';

		await storage.put(dummyFile, 'dummy content');
		const content = fs.readFileSync(realFsPath(dummyFile)).toString('utf-8');

		assert.equal(content, 'dummy content');
	});

	test('ignore extraneous double dots ..', async (assert) => {

		await storage.put('../../../dummy_file', 'dummy content');
		const content = fs.readFileSync(realFsPath('dummy_file')).toString('utf-8');

		assert.equal(content, 'dummy content');
	});

	test('don\'t ignore valid double dots ..', async (assert) => {
		await storage.put('fake_dir/../dummy_file', 'dummy content');
		const content = fs.readFileSync(realFsPath('dummy_file')).toString('utf-8');

		assert.equal(content, 'dummy content');
	});

	test('create file from stream', async (assert) => {
		await storage.put('foo', 'Foo related content');
		const readStream = fs.createReadStream(path.join(__dirname, './storage/foo'));

		await storage.put('bar', readStream);

		const { content } = await storage.get('bar');
		assert.equal(content, 'Foo related content');
	});

	test('append to exisiting file', async (assert) => {
		await storage.put('object', ' World');
		await storage.put('greeting', 'Hello');

		const readStream = fs.createReadStream(path.join(__dirname, './storage/object'));
		await storage.append('greeting', readStream);

		const { content } = await storage.get('greeting');
		assert.equal(content, 'Hello World');
	});

	test('throw exception when unable to find file', async (assert) => {
		assert.plan(1);

		const readStream = storage.getStream('foo');
		try {
			await streamToString(readStream);
		} catch ({ code }) {
			assert.equal(code, 'ENOENT');
		}
	});

	test('get stream of a given file', async (assert) => {
		await storage.put('foo', 'Foo');
		const readStream = storage.getStream('foo');
		const content = await streamToString(readStream);
		assert.equal(content, 'Foo');
	});

	test('get the stat of a given file', async (assert) => {
		await storage.put('foo', 'Foo content');
		const { size, modified } = await storage.getStat('foo');
		assert.equal(size, 11);
		assert.instanceOf(modified, Date);
	});
});
