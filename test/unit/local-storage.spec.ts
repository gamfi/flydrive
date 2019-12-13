/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */
import path from 'path';
import uuid from 'uuid';
import * as fs from "fs";
import { join } from "path";

import { LocalStorage } from "../../src/Storage/LocalStorage";
import { runGenericStorageSpec } from "../stubs/storage.generic";
import { MethodNotSupported } from "../../src/Exceptions";

const rootPath = path.join(__dirname, '../../var/local-storage');
const storage = new LocalStorage({ root: rootPath });

runGenericStorageSpec({
    storage,
    name: 'Local filesystem storage',
    options: {
        skip: ['getUrl', 'getSignedUrl'],
    },
});

describe('Local filesystem storage', () => {
    describe('.getUrl', function () {
        expect(() => storage.getUrl('anything')).toThrowError(MethodNotSupported);
    });

    describe('.getSignedUrl', () => {
        expect(() => storage.getSignedUrl('anything')).toThrowError(MethodNotSupported);
    });

    describe('.delete', () => {
        test('Removes empty data directories', async () => {
            const dirName = uuid.v4();
            const fileName = uuid.v4();
            const path = `${dirName}/${fileName}`;
            await storage.put(path, '');
            await storage.delete(path);

            expect(() => fs.statSync(join(rootPath, 'data', dirName))).toThrow('ENOENT');
        });

        test('Removes empty metadata directories', async () => {
            const dirName = uuid.v4();
            const fileName = uuid.v4();
            const path = `${dirName}/${fileName}`;
            await storage.put(path, '');
            await storage.delete(path);

            expect(() => fs.statSync(join(rootPath, 'meta', dirName))).toThrow('ENOENT');
        });
    });

    describe('#isSubDir', () => {
        test('checks if directory is a subdirectory of parent', () => {
            const testSets: [string, string, boolean][] = [
                ['/', '/foo', true],
                ['/dir', '/dir/dir', true],
                ['/dir', '/dir/dir/dir/dir', true],
                ['/dir', '/dir/dir/dir/../dir', true],
                ['/dir', '/dir/./dir', true],
                ['/dir', '/dir/../dir/subdir', true],
                ['/dir/../dir2', '/dir2/dir', true],
                ['/dir/subdir/..', '/dir/dir', true],
                ['', 'foo', false],
                ['/var/dir', 'foo', false],
                ['/var/foo', 'foo', false],
                ['/dir', '/dir', false],
                ['/dir/', '/dir', false],
                ['/dir/', '/dir/', false],
                ['/dir', '/dir/', false],
                ['/dir', '/dir/../dir', false],
                ['/dir/../dir2', '/dir/dir2', false],
                ['/dir/subdir/..', '/dir', false],
            ];

            testSets.forEach(([parent, sub, result]) => {
                // @ts-ignore
                expect(storage.isSubDir(parent, sub)).toStrictEqual(result);
            });
        });
    })
});
