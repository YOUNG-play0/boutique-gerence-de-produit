/**
 * Utilitaire de compression d'image pour les photos de produits :
 * Redimensionne l'image à 480 px maximum sur le plus grand côté via un Canvas HTML5
 * et encode en JPEG qualité 0.7 (format data URL).
 */
export async function compressProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error("Le fichier sélectionné n'est pas une image valide."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Impossible de charger l’image.'));
      img.onload = () => {
        const MAX_SIZE = 480;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Impossible d’initialiser le contexte canvas.'));
          return;
        }

        // Fond blanc pour éviter la transparence JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dessin de l'image redimensionnée
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Encodage JPEG qualité 0.7
        try {
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedDataUrl);
        } catch (encErr) {
          reject(encErr);
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
