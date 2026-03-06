import { db } from '../firebase'
import { collection, doc, getDocs, setDoc, limit, query } from 'firebase/firestore'

const INITIAL_EQUIPMENT = [
    { name: 'Cabina de Cultivo 1', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Cultivo 2', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Cultivo 3', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Cultivo 4', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Cultivo 5', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Cultivo 6', type: 'cabina_cultivo', requiresCertification: false },
    { name: 'Cabina de Bacterias', type: 'cabina_bacterias', requiresCertification: false },
    { name: 'Cabina de Extracción', type: 'cabina_extraccion', requiresCertification: false },
    { name: 'Microscopio de Fluorescencia', type: 'microscopio', requiresCertification: true },
    { name: 'Termociclador PCR', type: 'termociclador', requiresCertification: true },
]

export const seedDatabaseIfEmpty = async () => {
    try {
        const q = query(collection(db, 'equipment'), limit(1))
        const snapshot = await getDocs(q)

        if (snapshot.empty) {
            console.log('Seeding initial equipment data...')
            for (const eq of INITIAL_EQUIPMENT) {
                // Use a slug of the name as the ID
                const docId = eq.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                await setDoc(doc(db, 'equipment', docId), {
                    name: eq.name,
                    type: eq.type,
                    status: 'available',
                    requiresCertification: eq.requiresCertification || false,
                    maintenanceNote: null,
                    maintenanceUntil: null,
                    currentUserId: null,
                    currentUserName: null
                })
            }
            console.log('Seeding completed.')
        }
    } catch (e) {
        console.error('Error seeding data:', e)
    }
}
