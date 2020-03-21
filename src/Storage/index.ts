/**
 * @slynova/flydrive
 *
 * @license MIT
 * @copyright Slynova - Romain Lanz <romain.lanz@slynova.ch>
 */

import { AmazonWebServicesS3Storage } from './AmazonWebServicesS3Storage';
import { AzureBlockBlobStorage } from "./AzureBlockBlobStorage";
import { GoogleCloudStorage } from './GoogleCloudStorage';
import { LocalStorage } from './LocalStorage';
import { Storage as AbstractStorage } from './Storage';

export {
	AmazonWebServicesS3Storage,
	AzureBlockBlobStorage,
	GoogleCloudStorage,
	LocalStorage,
	AbstractStorage,
};
