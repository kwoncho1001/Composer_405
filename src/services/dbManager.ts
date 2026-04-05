import { openDB, IDBPDatabase } from 'idb';
import { Note } from '../types';

const DB_NAME = 'composer-db';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

let dbPromise: Promise<IDBPDatabase<any>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const getAllNotes = async (): Promise<Note[]> => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const saveNote = async (note: Note) => {
  const db = await initDB();
  await db.put(STORE_NAME, note);
};

export const deleteNote = async (id: string) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const bulkSaveNotes = async (notes: Note[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all(notes.map(note => tx.store.put(note)));
  await tx.done;
};

export const bulkDeleteNotes = async (ids: string[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
};
