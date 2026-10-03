/**
 * Utilitaires de formatage et d'audio pour la boutique en Guinée
 */

export function formatGNF(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 GNF';
  // Formate avec espaces comme séparateur de milliers : 50 000 GNF
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} GNF`;
}

export function formatDateFrench(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (isToday) {
      return `Aujourd'hui à ${timeStr}`;
    }
    if (isYesterday) {
      return `Hier à ${timeStr}`;
    }

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatDateShort(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Nettoie le numéro de téléphone pour WhatsApp (ajoute 224 si nécessaire)
 */
export function cleanPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  // Si commence par 00224, enlever 00
  if (cleaned.startsWith('00224')) {
    cleaned = cleaned.substring(2);
  }
  // Si commence par 224, c'est bon
  if (!cleaned.startsWith('224')) {
    // Si c'est un numéro guinéen local à 9 chiffres (ex: 620 12 34 56)
    if (cleaned.length === 9) {
      cleaned = '224' + cleaned;
    }
  }
  return cleaned;
}

/**
 * Génère le lien WhatsApp avec message poli en français
 */
export function createWhatsAppReminderLink(
  phone: string,
  customerName: string,
  amount: number,
  shopName: string = 'la Boutique'
): string {
  const cleanPhone = cleanPhoneForWhatsApp(phone);
  const amountStr = formatGNF(amount);
  const message = `Bonjour ${customerName},\n\nPetit rappel amical de ${shopName}.\nVotre solde restant est de ${amountStr}.\n\nMerci de bien vouloir passer régulariser dès que possible. Bonne journée !`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Bip sonore agréable à l'ajout au panier ou scan
 */
export function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Note La5 (880 Hz)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // Audio context may be restricted before gesture
  }
}

/**
 * Son de succès lors de la validation d'une vente
 */
export function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const notes = [523.25, 659.25, 783.99, 1046.5]; // Do, Mi, Sol, Do
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
    });
  } catch {
    // ignore
  }
}

/**
 * Vibration tactile sur mobile
 */
export function triggerHaptic(duration = 40) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  } catch {
    // ignore
  }
}
