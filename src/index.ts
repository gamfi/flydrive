import {StorageManager} from './StorageManager';

export {StorageManager};
export * from './Storage';
export * from './types';
export const manager = new StorageManager({disks: {}});
