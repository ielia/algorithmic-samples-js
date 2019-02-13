// ----- SYSTEM AREA [start] ----- // TODO: Improve "emulation"
const DEFAULT_MEMSIZE = 32;
const WARN_INCREASING_FILE_SIZE = false;
const MEMORY = [];

function ceil(n) {
    return parseInt(Math.ceil(n));
}

function feof(file, filePtr) {
    return filePtr >= file.length;
}

function floor(n) {
    return parseInt(n);
}

function free(memPtr) {
    // TODO: Keep a memory allocation table and free only those sections.
    MEMORY.splice(memPtr, MEMORY.length);
}

function fstat(file) {
    return { st_size: file.length };
}

function malloc(size) {
    // console.log('MALLOC:', size);
    // TODO: Keep a memory allocation table.
    const allocPtr = MEMORY.length;
    MEMORY.splice(allocPtr - 1, 0, ...new Array(size));
    return allocPtr;
}

function memcpy(targetPtr, sourcePtr, length) {
    if (MEMORY.length - sourcePtr < length) { throw new Error('MEDIAN: source SIGSEGV'); }
    if (MEMORY.length - targetPtr < length) { throw new Error('MEDIAN: target SIGSEGV'); }
    MEMORY.splice(targetPtr, length, ...MEMORY.slice(sourcePtr, sourcePtr + length));
}

function read(file, filePtr, memPtr, length) {
    // console.log('read:', filePtr, memPtr, length, MEMORY.length);
    if (MEMORY.length - memPtr < length) { throw new Error('MEDIAN: source SIGSEGV'); }
    const actualLength = Math.min(length, file.length - filePtr);
    MEMORY.splice(memPtr, actualLength, ...file.slice(filePtr, filePtr + actualLength));
    return actualLength;
}

function tmpfile() {
    return [];
}

function write(file, filePtr, memPtr, length) {
    // console.log('write:', filePtr, memPtr, length, MEMORY.length);
    if (MEMORY.length - memPtr < length) { throw new Error('MEDIAN: source SIGSEGV'); }
    if (WARN_INCREASING_FILE_SIZE && file.length - filePtr < length) { console.warn('MEDIAN: increasing file size'); }
    file.splice(filePtr, length, ...MEMORY.slice(memPtr, memPtr + length));
    return length;
}
// ----- SYSTEM AREA [ end ] -----

// ----- GRAY AREA [start] -----
function fcopy(to, from) {
    to.splice(0, to.length, ...from);
}

function memcmp(bufferAPtr, bufferASize, bufferBPtr, bufferBSize) {
    let aIdx = 0;
    let bIdx = 0;
    let result = 0;
    while (aIdx < bufferASize && bIdx < bufferBSize && result === 0) {
        result = MEMORY[bufferAPtr + aIdx++] - MEMORY[bufferBPtr + bIdx++];
    }
    return result;
}

function memsort(bufferPtr, batchSize) {
    const memSection = MEMORY.slice(bufferPtr, bufferPtr + batchSize);
    MEMORY.splice(bufferPtr, batchSize, ...memSection.sort((a, b) => a - b));
}
// ----- GRAY AREA [ end ] -----


// ===== USER AREA [start] =====

const MERGE_IN_PLACE = false;

function memcmpsorted(bufferAPtr, bufferASize, bufferBPtr, bufferBSize) {
    const result = MEMORY[bufferAPtr] - MEMORY[bufferBPtr];
    return result ? result : MEMORY[bufferAPtr + bufferASize - 1] - MEMORY[bufferBPtr + bufferBSize - 1];
}

function mergeIntoChunks(file, filePtr, batchSize, memSize) {
    const bufferSize = memSize / 2;
    const readSize = bufferSize / 2;
    let fileLeftPtr = filePtr;
    let fileRightPtr = filePtr + batchSize;
    let leftSize = read(file, fileLeftPtr, bufferSize, readSize);
    let rightSize = read(file, fileRightPtr, bufferSize + readSize, readSize);
    let leftTotalSize = leftSize;
    let rightTotalSize = rightSize;
    let bufferPtr = 0;
    while (leftSize > 0 && rightSize > 0 && leftTotalSize <= batchSize && rightTotalSize <= batchSize) {
        let leftPtr = 0;
        let rightPtr = 0;
        while (leftPtr < leftSize && rightPtr < rightSize) {
            const leftVal = MEMORY[bufferSize + leftPtr];
            const rightVal = MEMORY[bufferSize + readSize + rightPtr];
            if (leftVal < rightVal) {
                MEMORY[bufferPtr++] = leftVal;
                ++leftPtr;
            } else {
                MEMORY[bufferPtr++] = rightVal;
                ++rightPtr;
            }
            if (bufferPtr >= bufferSize) {
                bufferPtr = 0;
            }
        }
        if (leftPtr >= leftSize) {
            write(file, fileRightPtr, bufferPtr >= readSize ? 0 : readSize, rightSize);
            fileRightPtr += rightSize;
            rightSize = read(file, fileRightPtr, bufferSize + readSize, readSize);
            rightTotalSize += rightSize;
        } else {
            write(file, fileLeftPtr, bufferPtr >= readSize ? 0 : readSize, leftSize);
            fileLeftPtr += leftSize;
            leftSize = read(file, fileLeftPtr, bufferSize, readSize);
            leftTotalSize += leftSize;
        }
    }
    if (leftPtr < leftSize) {
        write(file, fileRightPtr, bufferPtr >= readSize ? 0 : readSize, rightSize);
        write(file, fileLeftPtr, bufferPtr >= readSize ? readSize : 0, leftPtr);
        write(file, fileLeftPtr + leftPtr, bufferSize + leftPtr, leftSize - leftPtr);
    } else {
        write(file, fileLeftPtr, bufferPtr >= readSize ? 0 : readSize, leftSize);
        write(file, fileRightPtr, bufferPtr >= readSize ? readSize : 0, rightPtr);
        write(file, fileRightPtr + rightPtr, bufferSize + readSize + rightPtr, rightSize - rightPtr);
    }
}

function mergeInPlace(file, filePtr, batchSize, memSize) {
    mergeIntoChunks(file, filePtr, batchSize, memSize);
    // TODO: Wrong logic...
    fileLeftPtr = filePtr;
    fileRightPtr = filePtr + batchSize;
    leftSize = read(file, fileLeftPtr, 0, readSize);
    rightSize = read(file, fileRightPtr, readSize, readSize);
    leftTotalSize = leftSize;
    rightTotalSize = rightSize;
    while (leftTotalSize <= batchSize && rightTotalSize <= batchSize && leftSize === rightSize && leftSize > 0) {
        const cmp = memcmpsorted(0, leftSize, readSize, rightSize);
        if (cmp <= 0) {
            write(file, filePtr, 0, leftSize);
            filePtr += leftSize;
            if (leftTotalSize < batchSize) {
                fileLeftPtr += leftSize;
                leftSize = read(file, fileLeftPtr, 0, readSize);
                leftTotalSize += leftSize;
            } else {
                ++leftTotalSize;
            }
        } else {
            while (cmp > 0 && rightSize === leftSize && rightTotalSize <= batchSize) {
                write(file, filePtr, readSize, rightSize);
                filePtr += rightSize;
                if (rightTotalSize < batchSize) {
                    fileRightPtr += rightSize;
                    rightSize = read(file, filePtr, readSize, readSize);
                    rightTotalSize += rightSize;
                    cmp = memcmpsorted(0, leftSize, readSize, rightSize);
                } else {
                    ++rightTotalSize;
                }
            }
        }
    }
}

function mergeWithSwapFile(file, swapFile, filePtr, batchSize, memSize) {
    // TODO: Reduce.
    // const originalFilePtr = filePtr;
    const bufferSize = memSize / 2;
    const readSize = bufferSize / 2;
    let fileLeftPtr = filePtr;
    let fileRightPtr = filePtr + batchSize;
    const leftBasePtr = bufferSize;
    const rightBasePtr = bufferSize + readSize;
    let leftSize = read(file, fileLeftPtr, leftBasePtr, readSize);
    let rightSize = read(file, fileRightPtr, rightBasePtr, readSize);
    let leftTotalSize = leftSize;
    let rightTotalSize = rightSize;
    let bufferPtr = 0;
    let leftPtr = 0;
    let rightPtr = 0;
    while (leftSize > 0 && rightSize > 0 && leftTotalSize <= batchSize && rightTotalSize <= batchSize) {
        const leftVal = MEMORY[leftBasePtr + leftPtr];
        const rightVal = MEMORY[bufferSize + readSize + rightPtr];
        if (leftVal < rightVal) {
            MEMORY[bufferPtr++] = leftVal;
            ++leftPtr;
            if (leftPtr >= leftSize) {
                if (leftTotalSize === batchSize) {
                    ++leftTotalSize;
                    leftSize = 0;
                } else {
                    // console.log('LOAD LEFT MEMORY: buffer =', MEMORY.slice(0, bufferSize), 'left =', MEMORY.slice(leftBasePtr, bufferSize + readSize), 'right =', MEMORY.slice(bufferSize + readSize));
                    fileLeftPtr += leftSize;
                    leftSize = read(file, fileLeftPtr, bufferSize, readSize);
                    leftTotalSize += leftSize;
                    leftPtr = 0;
                }
            }
        } else {
            MEMORY[bufferPtr++] = rightVal;
            ++rightPtr;
            if (rightPtr >= rightSize) {
                if (rightTotalSize === batchSize) {
                    ++rightTotalSize;
                    rightSize = 0;
                } else {
                    // console.log('LOAD RIGHT MEMORY: buffer =', MEMORY.slice(0, bufferSize), 'left =', MEMORY.slice(leftBasePtr, bufferSize + readSize), 'right =', MEMORY.slice(bufferSize + readSize));
                    fileRightPtr += rightSize;
                    rightSize = read(file, fileRightPtr, bufferSize + readSize, readSize);
                    rightTotalSize += rightSize;
                    rightPtr = 0;
                }
            }
        }
        if (bufferPtr >= bufferSize) {
            // console.log('SAVE MEMORY: buffer =', MEMORY.slice(0, bufferSize), 'left =', MEMORY.slice(leftBasePtr, bufferSize + readSize), 'right =', MEMORY.slice(bufferSize + readSize));
            write(swapFile, filePtr, 0, bufferSize);
            filePtr += bufferSize;
            bufferPtr = 0;
        }
    }
    if (bufferPtr) {
        write(swapFile, filePtr, 0, bufferPtr);
        filePtr += bufferPtr;
    }
    // console.log('SWAP SLICE(', originalFilePtr, ',', filePtr, '):', swapFile.slice(originalFilePtr, filePtr));
    const leftRest = leftSize - leftPtr;
    const rightRest = rightSize - rightPtr;
    if (leftRest > 0) {
        write(swapFile, filePtr, bufferSize + leftPtr, leftRest);
        filePtr += leftRest;
        while (leftSize > 0 && leftTotalSize < batchSize) {
            fileLeftPtr += leftSize;
            leftSize = read(file, fileLeftPtr, 0, Math.min(memSize, batchSize - leftTotalSize));
            leftTotalSize += leftSize;
            write(swapFile, filePtr, 0, leftSize);
            filePtr += leftSize;
        }
    } else if (rightRest > 0) {
        write(swapFile, filePtr, bufferSize + readSize + rightPtr, rightRest);
        filePtr += rightRest;
        while (rightSize > 0 && rightTotalSize < batchSize) {
            fileRightPtr += rightSize;
            rightSize = read(file, fileRightPtr, 0, Math.min(memSize, batchSize - rightTotalSize));
            rightTotalSize += rightSize;
            write(swapFile, filePtr, 0, rightSize);
            filePtr += rightSize;
        }
    }
}

function sortAllBatches(file, batchSize, batches, memSize) {
    let currBatchSize = batchSize;
    let currBatches = batches;
    let currFile = file;
    let currFileOriginal = true;
    let numSorts = floor(batches / 2) * 2;
    const swapFile = MERGE_IN_PLACE ? null : tmpfile();
    let currSwap = swapFile;
    while (numSorts) {
        // console.log('currBatches:', currBatches, '| numSorts:', numSorts, '| currBatchSize:', currBatchSize);
        // console.log('currFile:', currFile);
        // console.log('currFile - first batch:', currFile.slice(0, batchSize));
        // console.log('currFile - second batch:', currFile.slice(batchSize, batchSize * 2));
        // console.log('currSwap:', currSwap);
        // console.log('currSwap - first batch:', currSwap.slice(0, batchSize));
        // console.log('currSwap - second batch:', currSwap.slice(batchSize, batchSize * 2));
        const mergeSize = currBatchSize * 2;
        let filePtr = 0;
        if (MERGE_IN_PLACE) {
            for (let i = 0; i < numSorts; ++i) {
                mergeInPlace(currFile, filePtr, currBatchSize, memSize);
                filePtr += mergeSize;
            }
        } else {
            for (let i = 0; i < numSorts; ++i) {
                mergeWithSwapFile(currFile, currSwap, filePtr, currBatchSize, memSize);
                filePtr += mergeSize;
            }
            currFile = currFileOriginal ? swapFile : file;
            currSwap = currFileOriginal ? file : swapFile;
            currFileOriginal = !currFileOriginal;
        }
        currBatchSize = mergeSize;
        currBatches = ceil(currBatches / 2);
        numSorts = floor(currBatches / 2) * 2;
    }
    if (!currFileOriginal) {
        fcopy(file, swapFile);
    }
}

function largeMergeSort(file, memSize = DEFAULT_MEMSIZE) {
    let filePtr = 0;
    let batches = 0;
    malloc(memSize);
    while (!feof(file, filePtr)) {
        ++batches;
        const batchSize = read(file, filePtr, 0, memSize);
        memsort(0, batchSize);
        write(file, filePtr, 0, batchSize);
        filePtr += batchSize;
    }
    // console.log('INTERMEDIATE FILE:', file);
    sortAllBatches(file, memSize, batches, memSize);
    free(0);
}

function naiveLargeMedian(file, memSize = DEFAULT_MEMSIZE) {
    memSize = Math.pow(2, Math.floor(Math.log2(memSize)));
    largeMergeSort(file, memSize);
    malloc(2);
    let result = null;
    const size = fstat(file).st_size;
    if (size % 2) {
        read(file, size / 2 - 1, 0, 2);
        result = (MEMORY[0] + MEMORY[1]) / 2;
    } else {
        read(file, size / 2 - 1, 0, 1);
        result = MEMORY[0];
    }
    free(0);
    return result;
}

