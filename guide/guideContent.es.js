// FILE: guide/guideContent.es.js
// PURPOSE: Spanish copy + page tree for the visitor guide (data only, no logic).
// Visitor-facing text is Spanish only. Photos live in /guide/img/ (optional).
// Block types: p, h, quote, list {items}, note {title,x}
// Page fields: parent, label (short name for "Siguiente"), next, nextText,
//              links, images, action ('survey' on the closing card only)

export const GUIDE_HOME = 'menu';

export const GUIDE_PAGES = {
  menu: {
    eyebrow: 'BAPS Shri Swaminarayan Mandir – Atlanta',
    title: 'Un lugar de amor, paz y armonía',
    blocks: [
      { t: 'p', x: 'Bienvenido. Este mandir, o templo hindú, es un lugar sagrado de oración, reflexión e inspiración dedicado a Bhagwan Swaminarayan.' },
      { t: 'p', x: 'Recibe a personas de todas las religiones y culturas. Más que un monumento arquitectónico, es un lugar donde la fe, la cultura, el servicio y la comunidad se encuentran cada día.' },
      { t: 'p', x: 'Le invitamos a descubrir sus tradiciones con curiosidad, respeto y un corazón abierto.' },
    ],
    topicsLabel: '¿Qué le gustaría conocer?',
    topics: [
      { id: 'mandir', label: '¿Qué es un mandir?' },
      { id: 'baps', label: 'BAPS y sus guías espirituales' },
      { id: 'art', label: 'Arte e historia' },
      { id: 'prayer', label: 'Oración y ceremonias' },
      { id: 'community', label: 'Comunidad y servicio' },
      { id: 'visit', label: 'Información para su visita' },
    ],
  },

  mandir: {
    parent: 'menu',
    label: '¿Qué es un mandir?',
    next: 'baps',
    title: '¿Qué es un mandir?',
    blocks: [
      { t: 'p', x: 'Un mandir es un templo hindú: un espacio sagrado donde las personas oran, reflexionan y profundizan su relación con Dios.' },
      { t: 'p', x: 'Para los fieles, no es simplemente un edificio. Es la casa de Dios, donde la devoción, las tradiciones y los valores espirituales se viven cada día.' },
      { t: 'p', x: 'En su corazón se encuentran las murtis: formas sagradas de Dios que los fieles veneran como una presencia viva de lo Divino.' },
      { t: 'p', x: 'Además de la oración, los mandirs reúnen a las personas para aprender, celebrar y servir a los demás.' },
    ],
    images: [{ file: 'what-is-mandir.png', shape: 'landscape', alt: 'Vista del Mandir' }],
  },

  baps: {
    parent: 'menu',
    label: 'BAPS y sus guías espirituales',
    next: 'art',
    title: 'BAPS Swaminarayan Sanstha',
    blocks: [
      { t: 'p', x: 'BAPS es una organización espiritual hindú de alcance mundial, guiada por las enseñanzas védicas de Bhagwan Swaminarayan.' },
      { t: 'p', x: 'Promueve el crecimiento espiritual de las personas, el servicio a la comunidad y la armonía familiar.' },
      { t: 'p', x: 'Estos valores cobran vida en el Mandir a través de la oración, el aprendizaje, las actividades culturales y el servicio desinteresado.' },
      { t: 'h', x: 'Conozca a sus guías espirituales:' },
    ],
    links: [
      { id: 'pramukh', label: 'Pramukh Swami Maharaj' },
      { id: 'mahant', label: 'Mahant Swami Maharaj' },
    ],
    images: [{ file: 'baps-about.png', shape: 'landscape', alt: 'Actividades de BAPS en el Mandir' }],
  },

  pramukh: {
    parent: 'baps',
    label: 'Pramukh Swami Maharaj',
    next: 'mahant',
    nextText: 'Conozca a Mahant Swami Maharaj',
    title: 'Su Santidad Pramukh Swami Maharaj',
    subtitle: '1921–2016',
    blocks: [
      { t: 'p', x: 'Su Santidad Pramukh Swami Maharaj fue el quinto sucesor espiritual de Bhagwan Swaminarayan. Su visión y sus incansables esfuerzos inspiraron la creación de este Mandir.' },
      { t: 'p', x: 'Su vida fue un ejemplo de devoción, humildad y servicio a los demás. Su mensaje continúa inspirando:' },
      { t: 'quote', x: '«En la alegría de los demás está nuestra propia alegría».' },
    ],
    images: [{ file: 'pramukh-swami-maharaj.png', shape: 'portrait', alt: 'Retrato de Su Santidad Pramukh Swami Maharaj' }],
  },

  mahant: {
    parent: 'baps',
    label: 'Mahant Swami Maharaj',
    next: 'art',
    title: 'Su Santidad Mahant Swami Maharaj',
    blocks: [
      { t: 'p', x: 'Su Santidad Mahant Swami Maharaj sucedió a Pramukh Swami Maharaj como sexto sucesor espiritual de Bhagwan Swaminarayan y es el actual gurú de BAPS.' },
      { t: 'p', x: 'Conocido por su humildad, austeridad, devoción y servicio, continúa guiando BAPS siguiendo el ejemplo de sus predecesores espirituales.' },
      { t: 'p', x: 'Su vida y sus enseñanzas promueven la paz, la armonía y la unidad.' },
    ],
    images: [{ file: 'mahant-swami-maharaj.png', shape: 'portrait', alt: 'Retrato de Su Santidad Mahant Swami Maharaj' }],
  },

  art: {
    parent: 'menu',
    label: 'Arte e historia',
    next: 'prayer',
    title: 'Arte, historia y devoción',
    blocks: [
      { t: 'p', x: 'El Mandir refleja tradiciones arquitectónicas hindúes transmitidas de generación en generación.' },
      { t: 'p', x: 'Más de 34.000 piezas de mármol italiano, piedra caliza turca y arenisca rosa de la India fueron talladas a mano en la India y ensambladas en Lilburn como un enorme rompecabezas tridimensional.' },
      { t: 'p', x: 'Inspirado por Su Santidad Pramukh Swami Maharaj, el Mandir fue inaugurado en 2007. Su construcción contó con aproximadamente 1,3 millones de horas de servicio voluntario.' },
      { t: 'p', x: 'Su belleza va más allá de la piedra: es una expresión de fe, dedicación y servicio desinteresado.' },
    ],
    images: [{ file: 'art-history.png', shape: 'landscape', alt: 'Tallas de piedra del Mandir' }],
  },

  prayer: {
    parent: 'menu',
    label: 'Oración y ceremonias',
    next: 'community',
    title: 'Oración y ceremonias',
    blocks: [
      { t: 'p', x: 'El Mandir es, ante todo, un lugar de oración. Cada día, los fieles expresan su gratitud, buscan bendiciones y profundizan su relación con Dios.' },
      { t: 'p', x: 'Las personas de todas las religiones y culturas son bienvenidas a observar estas tradiciones con respeto.' },
      { t: 'p', x: 'Seleccione una tradición para conocer su significado.' },
    ],
    links: [
      { id: 'darshan', label: 'Murti Darshan: contemplar lo Divino' },
      { id: 'arti', label: 'Arti: una ofrenda de luz' },
      { id: 'abhishek', label: 'Abhishek: una ofrenda de agua' },
    ],
  },

  darshan: {
    parent: 'prayer',
    label: 'Murti Darshan',
    next: 'arti',
    title: 'Murti Darshan',
    blocks: [
      { t: 'p', x: 'En el interior del Mandir hay nueve santuarios que albergan murtis: formas sagradas de Dios veneradas como una presencia viva de lo Divino.' },
      { t: 'p', x: 'Darshan significa ver y estar en presencia de lo Divino. Para los fieles, es una oportunidad de ofrecer oraciones, expresar devoción y buscar bendiciones.' },
      { t: 'p', x: 'Los visitantes son bienvenidos a conocer esta tradición con respeto. El darshan está disponible en horarios determinados.' },
    ],
    images: [{ file: 'murti-darshan.png', shape: 'landscape', alt: 'Santuario con murtis' }],
  },

  arti: {
    parent: 'prayer',
    label: 'Arti',
    next: 'abhishek',
    title: 'Arti: una ofrenda de luz',
    blocks: [
      { t: 'p', x: 'El Arti es una ceremonia de oración hindú en la que se ofrece luz a Dios mediante mechas de algodón encendidas, acompañadas de cantos devocionales y música.' },
      { t: 'p', x: 'Esta ceremonia expresa gratitud, amor y devoción.' },
      { t: 'p', x: 'Los visitantes son bienvenidos a observar en silencio y ofrecer una oración o reflexión personal.' },
      { t: 'p', x: 'Horario: todos los días a las 11:15 a. m.' },
      { t: 'p', x: 'Duración aproximada: 10 minutos.' },
    ],
    images: [{ file: 'arti.png', shape: 'landscape', alt: 'Ceremonia del Arti' }],
  },

  abhishek: {
    parent: 'prayer',
    label: 'Abhishek',
    next: 'community',
    title: 'Shri Nilkanth Varni Abhishek',
    blocks: [
      { t: 'p', x: 'El Abhishek es un ritual hindú en el que se vierte suavemente agua santificada sobre la murti de Shri Nilkanth Varni, la forma adolescente de Bhagwan Swaminarayan.' },
      { t: 'p', x: 'Es una expresión de devoción y gratitud, y una oportunidad para ofrecer oraciones personales y buscar bendiciones.' },
      { t: 'p', x: 'Los visitantes son bienvenidos a participar con respeto o a observar en silencio.' },
    ],
    images: [{ file: 'nilkanth-varni-abhishek.png', shape: 'portrait', alt: 'Murti de Shri Nilkanth Varni' }],
  },

  community: {
    parent: 'menu',
    label: 'Comunidad y servicio',
    next: 'visit',
    title: 'Una comunidad de fe y servicio',
    blocks: [
      { t: 'p', x: 'La vida del Mandir continúa más allá de la oración. Durante todo el año, personas de distintas generaciones se reúnen para aprender, celebrar y servir.' },
      { t: 'p', x: 'Los programas educativos y las actividades culturales promueven valores como la honestidad, la humildad, la compasión y el respeto.' },
      { t: 'p', x: 'El servicio desinteresado, conocido como seva, es un valor fundamental de BAPS. Los voluntarios contribuyen con su tiempo y sus habilidades para apoyar el Mandir y recibir a sus visitantes.' },
      { t: 'p', x: 'A través de BAPS Charities, también participan en iniciativas de salud, servicio comunitario y ayuda humanitaria.' },
    ],
    images: [{ file: 'community-service.png', shape: 'landscape', alt: 'Voluntarios y comunidad del Mandir' }],
  },

  visit: {
    parent: 'menu',
    label: 'Información para su visita',
    next: 'thanks',
    nextText: 'Finalizar el recorrido',
    title: 'Información para su visita',
    blocks: [
      { t: 'p', x: 'Continúe descubriendo el Mandir a su propio ritmo.' },
    ],
    links: [
      { id: 'audio', label: 'Audioguía en español' },
      { id: 'cafe', label: 'Café Shayona y tienda de regalos' },
      { id: 'guidelines', label: 'Indicaciones para su visita' },
    ],
    after: [
      { t: 'note', title: '¿Necesita ayuda?', x: 'Consulte a un voluntario para conocer los horarios, orientarse o hacer preguntas sobre su visita.' },
    ],
  },

  audio: {
    parent: 'visit',
    label: 'Audioguía en español',
    next: 'cafe',
    title: 'Audioguía en español',
    blocks: [
      { t: 'p', x: 'Descubra la arquitectura, la historia y las tradiciones del Mandir a su propio ritmo con una audioguía en español.' },
      { t: 'p', x: 'Está disponible para alquilar en la tienda de regalos y libros, al pie de las escaleras del Mandir.' },
      { t: 'p', x: 'El alquiler tiene un costo. Consulte en la tienda para conocer la disponibilidad y la tarifa.' },
    ],
    images: [{ file: 'audio-guide.png', shape: 'landscape', alt: 'Audioguía en español' }],
  },

  cafe: {
    parent: 'visit',
    label: 'Café Shayona y tienda de regalos',
    next: 'guidelines',
    title: 'Café Shayona y tienda de regalos',
    blocks: [
      { t: 'h', x: 'Café Shayona' },
      { t: 'p', x: 'Ubicado en el recinto del Mandir, el Café Shayona ofrece comida vegetariana de la India, bocadillos, bebidas y dulces tradicionales.' },
      { t: 'p', x: 'Horario: todos los días, de 11:00 a. m. a 7:30 p. m.' },
      { t: 'h', x: 'Tienda de regalos y libros' },
      { t: 'p', x: 'Explore libros, postales, recursos y regalos relacionados con las tradiciones hindúes y la cultura de la India.' },
      { t: 'p', x: 'Horario: de 10:00 a. m. a 6:00 p. m.' },
      { t: 'p', x: 'Consulte a un voluntario para saber cómo llegar.' },
    ],
    images: [
      { file: 'shayona-cafe.png', shape: 'landscape', alt: 'Café Shayona' },
      { file: 'gift-shop.png', shape: 'landscape', alt: 'Tienda de regalos y libros' },
    ],
  },

  guidelines: {
    parent: 'visit',
    label: 'Indicaciones para su visita',
    next: 'thanks',
    nextText: 'Finalizar el recorrido',
    title: 'Indicaciones para su visita',
    blocks: [
      { t: 'p', x: 'Ayúdenos a mantener un ambiente de respeto y tranquilidad.' },
      {
        t: 'list',
        items: [
          'Mantenga los hombros y las rodillas cubiertos. Hay prendas para cubrirse disponibles.',
          'Quítese los zapatos antes de entrar al Mandir.',
          'Mantenga silencio dentro del Mandir.',
          'No se permite tomar fotografías ni grabar videos en el interior del Mandir.',
          'No toque las tallas ni se suba a ellas.',
          'Los menores de 16 años deben estar acompañados por un adulto.',
        ],
      },
      { t: 'p', x: 'Estas son algunas indicaciones básicas. Consulte a un voluntario si necesita conocer las normas completas.' },
    ],
    images: [{ file: 'visitor-guidelines.png', shape: 'landscape', alt: 'Indicaciones para visitantes' }],
  },

  // Closing card: the ONLY place the survey is offered inside the guide.
  thanks: {
    parent: 'menu',
    label: 'Gracias',
    title: 'Gracias por acompañarnos',
    blocks: [
      { t: 'p', x: 'Si lo desea, cuéntenos cómo fue su experiencia.' },
    ],
    action: 'survey',
    actionLabel: 'Compartir mi experiencia',
  },
};
