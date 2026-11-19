# Backup Manifest v1 — бъдещ договор за Дни 13–14

`backup-manifest-v1.example.json` е **илюстративен JSON**, не готов архив и не валиден SHA-256 backup: примерът изписва само един от петте step assets и използва placeholder хешове/размери. Производственият ZIP трябва да включва **всички** guide-step assets, посочени в `projects[].guide.steps`, всеки с действителен SHA-256 над бинарния Blob.

Каноничният TypeScript контракт е `app/src/storage/backup-contract.ts`. По време на T14: 
- възстановените `projects[].guide` трябва да съвпадат по mode, sourceAssetId, reveal, currentStep, steps (id, assetId, title, order, accepted) и generator;
- валидират се ownership, sourceAssetId и `assets.role = 'guide-step'` за **всяка** стъпка;
- преди commit се проверяват версия, размери, MIME, path, hash и unzip лимити;
- без непълни/осиротели assets или частично обновяване на DB при грешка.
