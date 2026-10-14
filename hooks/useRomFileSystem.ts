import * as SAF from '@joplin/react-native-saf-x';
import RNFetchBlob from "react-native-blob-util";
import * as FileSystem from 'expo-file-system';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { RomFile } from '../services/api';
import { PlatformFolder, usePlatformFolders } from './usePlatformFolders';


interface RomHash {
    hash: string;
    lastModified: number;
}

// Listing a large SAF folder is expensive, so concurrent checks against the
// same folder share a single in-flight listing instead of each listing it again.
const inFlightListings = new Map<string, Promise<string[]>>();

const listFolderFileNames = (folderUri: string): Promise<string[]> => {
    const pending = inFlightListings.get(folderUri);
    if (pending) return pending;

    const listing = (async () => {
        if (Platform.OS === 'android') {
            return (await SAF.listFiles(folderUri)).map(file => file.name);
        }
        // For iOS, use expo-file-system
        return await FileSystem.readDirectoryAsync(folderUri);
    })().finally(() => inFlightListings.delete(folderUri));

    inFlightListings.set(folderUri, listing);
    return listing;
};

const romFileExistsIn = (fileList: string[], romFile: RomFile): boolean => {
    const fileNameWithoutExtension = romFile.file_name.replace(/\.[^/.]+$/, '');
    return fileList.some(file => file.includes(fileNameWithoutExtension));
};

export const useRomFileSystem = () => {
    const { searchPlatformFolder } = usePlatformFolders();
    const [fileChecks, setFileChecks] = useState<Record<number, boolean>>({});
    const [checking, setChecking] = useState<Record<number, boolean>>({});

    const checkIfRomExists = useCallback(async (romFile: RomFile, platformFolder: PlatformFolder): Promise<boolean> => {
        // Check if there are files
        if (!romFile) {
            console.log('No files available for this ROM');
            return false;
        }

        if (!platformFolder || !platformFolder.folderUri) {
            console.warn('No platform folder configured. Cannot check if ROM exists.');
            return false;
        }

        try {
            const fileList = await listFolderFileNames(platformFolder.folderUri);

            // Check if the ROM file exists in the platform folder
            const romExists = romFileExistsIn(fileList, romFile);

            if (romExists) {
                console.log('ROM already exists in the folder:', romFile.file_name);
                setFileChecks(prev => ({ ...prev, [romFile.rom_id]: true }));
                return true;
            }

            setFileChecks(prev => ({ ...prev, [romFile.rom_id]: false }));
            return false;

        } catch (error) {
            console.error('Error checking existing files:', error);
            const exists = false;
            setFileChecks(prev => ({ ...prev, [romFile.rom_id]: exists }));
            return exists;
        }


    }, [searchPlatformFolder]);

    const isRomDownloaded = useCallback((romFile?: RomFile): boolean => {
        if (!romFile) return false;
        return fileChecks[romFile.rom_id] || false;
    }, [fileChecks]);

    const isCheckingRom = useCallback((romFile?: RomFile): boolean => {
        if (!romFile) return false;
        return checking[romFile.rom_id] || false;
    }, [checking]);

    // Checks many ROM files against one folder with a single listing and a
    // single state update, instead of one listing and re-render per file.
    const checkRomFilesInFolder = useCallback(async (romFiles: (RomFile | undefined)[], platformFolder: PlatformFolder): Promise<void> => {
        const validFiles = romFiles.filter((romFile): romFile is RomFile => !!romFile);
        if (validFiles.length === 0 || !platformFolder?.folderUri) {
            return;
        }

        let fileList: string[] = [];
        try {
            fileList = await listFolderFileNames(platformFolder.folderUri);
        } catch (error) {
            console.error('Error checking existing files:', error);
        }

        const results: Record<number, boolean> = {};
        for (const romFile of validFiles) {
            // A ROM counts as downloaded if any of its files is present
            results[romFile.rom_id] = results[romFile.rom_id] || romFileExistsIn(fileList, romFile);
        }
        setFileChecks(prev => ({ ...prev, ...results }));
    }, []);

    const checkMultipleRoms = useCallback(async (romsFiles: RomFile[], platformFolder: PlatformFolder): Promise<void> => {
        // Only check ROMs that haven't been checked yet
        const romsFilesToCheck = romsFiles.filter(romFile =>
            fileChecks[romFile.rom_id] === undefined && !checking[romFile.rom_id]
        );

        if (romsFilesToCheck.length === 0) {
            return;
        }

        // list all files in the platform folder
        if (!platformFolder || !platformFolder.folderUri) {
            console.warn('No platform folder configured for:', platformFolder.platformSlug);
            return;
        }

        await Promise.all(romsFilesToCheck.map(async (romFile, _) => {
            await checkIfRomExists(romFile, platformFolder);
        }));
    }, [checkIfRomExists, fileChecks, checking]);

    const refreshRomCheck = useCallback(async (romFile: RomFile, platformFolder: PlatformFolder): Promise<boolean> => {
        if (!romFile) return false;

        console.log('Refreshing ROM check for:', romFile.file_name);

        if (fileChecks[romFile.rom_id] == true) {
            // If already checked and exists, return true
            return true;
        }

        return await checkIfRomExists(romFile, platformFolder);
    }, [checkIfRomExists]);

    const resetRomsCheck = useCallback((romsFiles: RomFile[]) => {
        romsFiles.forEach((romFile, _) => {
            setFileChecks(prev => ({ ...prev, [romFile.rom_id]: false }));
            setChecking(prev => ({ ...prev, [romFile.rom_id]: false }));
        });
    }, []);

    const memoizedReturn = useMemo(() => ({
        resetRomsCheck,
        checkIfRomExists,
        isRomDownloaded,
        isCheckingRom,
        checkMultipleRoms,
        checkRomFilesInFolder,
        refreshRomCheck,
        fileChecks,
        checking
    }), [
        resetRomsCheck,
        checkIfRomExists,
        isRomDownloaded,
        isCheckingRom,
        checkMultipleRoms,
        checkRomFilesInFolder,
        refreshRomCheck,
        fileChecks,
        checking
    ]);

    return memoizedReturn;
};
