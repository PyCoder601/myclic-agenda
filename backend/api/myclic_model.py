from django.db import models


class Application(models.Model):
    # -----------------------------
    # Champs principaux
    # -----------------------------
    entreprise = models.CharField(
        max_length=255,
        db_column="entreprise"
    )

    nb_user = models.IntegerField(
        db_column="nbUser",
        null=True,
        blank=True
    )

    nb_agence = models.IntegerField(
        db_column="nbAgence",
        null=True,
        blank=True
    )

    nom_resp = models.CharField(
        max_length=255,
        db_column="nomResp",
        null=True,
        blank=True
    )

    prenom_resp = models.CharField(
        max_length=255,
        db_column="prenomResp",
        null=True,
        blank=True
    )

    mail_resp = models.EmailField(
        max_length=255,
        db_column="mailResp",
        null=True,
        blank=True
    )

    adresse = models.CharField(
        max_length=255,
        db_column="adresse",
        null=True,
        blank=True
    )

    telephone = models.CharField(
        max_length=255,
        db_column="telephone",
        null=True,
        blank=True
    )

    archive = models.BooleanField(
        db_column="archive",
        null=True,
        blank=True
    )

    is_active = models.BooleanField(
        db_column="isActive",
        null=True,
        blank=True
    )

    nom_affaire = models.CharField(
        max_length=255,
        db_column="nomAffaire",
        null=True,
        blank=True
    )

    webmail = models.CharField(
        max_length=255,
        db_column="webmail",
        null=True,
        blank=True
    )

    # -----------------------------
    # Relation parent (self FK)
    # -----------------------------
    parent = models.ForeignKey(
        "self",
        db_column="parent_id",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="enfants"
    )

    # -----------------------------
    # Champs techniques / métier
    # -----------------------------
    spacivox_token = models.TextField(
        db_column="spacivoxToken",
        null=True,
        blank=True
    )

    iframe_data_studio = models.TextField(
        db_column="iframeDataStudio",
        null=True,
        blank=True
    )

    categorie_app_id = models.IntegerField(
        db_column="categorieApp_id",
        null=True,
        blank=True
    )

    cerfa_background_image = models.TextField(
        db_column="cerfaBackgroundImage",
        null=True,
        blank=True
    )

    updated_at = models.DateTimeField(
        db_column="updatedAt",
        null=True,
        blank=True
    )

    is_cfa = models.BooleanField(
        db_column="isCfa",
        null=True,
        blank=True
    )

    is_of = models.BooleanField(
        db_column="isOf",
        null=True,
        blank=True
    )

    devise_id = models.IntegerField(
        db_column="devise_id",
        null=True,
        blank=True
    )

    is_manage_stock = models.BooleanField(
        db_column="isManageStock",
        default=False
    )

    iban = models.CharField(
        max_length=255,
        db_column="iban",
        null=True,
        blank=True
    )

    bic = models.CharField(
        max_length=255,
        db_column="bic",
        null=True,
        blank=True
    )

    rib = models.CharField(
        max_length=255,
        db_column="rib",
        null=True,
        blank=True
    )

    is_partenaire = models.BooleanField(
        db_column="isPartenaire",
        null=True,
        blank=True
    )

    etat = models.JSONField(
        db_column="etat",
        null=True,
        blank=True
    )

    # -----------------------------
    # Meta
    # -----------------------------
    class Meta:
        db_table = "application"
        managed = False

    def __str__(self):
        return self.entreprise



class Compte(models.Model):
    # -----------------------------
    # Identité / relations (IDs)
    # -----------------------------
    agence_id = models.IntegerField(
        db_column="agence_id",
        null=True,
        blank=True
    )

    pays_id = models.IntegerField(
        db_column="pays_id",
        null=True,
        blank=True
    )

    application_id = models.IntegerField(
        db_column="application_id",
        null=True,
        blank=True
    )

    numero_compte_id = models.IntegerField(
        db_column="numeroCompte_id",
        null=True,
        blank=True
    )

    file_import_id = models.IntegerField(
        db_column="fileImport_id",
        null=True,
        blank=True
    )

    opco_id = models.IntegerField(
        db_column="opco_id",
        null=True,
        blank=True
    )

    diplome_id = models.IntegerField(
        db_column="diplome_id",
        null=True,
        blank=True
    )

    # -----------------------------
    # Infos société
    # -----------------------------
    nom = models.CharField(
        max_length=255,
        db_column="nom"
    )

    genre = models.IntegerField(
        db_column="genre",
        null=True,
        blank=True
    )

    siret = models.CharField(
        max_length=255,
        db_column="siret",
        null=True,
        blank=True
    )

    siren = models.CharField(
        max_length=255,
        db_column="siren",
        null=True,
        blank=True
    )

    ape = models.CharField(
        max_length=255,
        db_column="ape",
        null=True,
        blank=True
    )

    tvaintra = models.CharField(
        max_length=255,
        db_column="tvaintra",
        null=True,
        blank=True
    )

    code_societe = models.CharField(
        max_length=255,
        db_column="codeSociete",
        null=True,
        blank=True
    )

    societe_com = models.CharField(
        max_length=255,
        db_column="societeCom",
        null=True,
        blank=True
    )

    etat = models.CharField(
        max_length=255,
        db_column="etat",
        null=True,
        blank=True
    )

    statut = models.IntegerField(
        db_column="statut",
        null=True,
        blank=True
    )

    # -----------------------------
    # Contact
    # -----------------------------
    email = models.CharField(
        max_length=255,
        db_column="email",
        null=True,
        blank=True
    )

    telephone = models.CharField(
        max_length=255,
        db_column="telephone",
        null=True,
        blank=True
    )

    fax = models.CharField(
        max_length=55,
        db_column="fax",
        null=True,
        blank=True
    )

    site = models.CharField(
        max_length=255,
        db_column="site",
        null=True,
        blank=True
    )

    dirigeant = models.CharField(
        max_length=255,
        db_column="dirigeant",
        null=True,
        blank=True
    )

    # -----------------------------
    # Adresse
    # -----------------------------
    adresse = models.CharField(
        max_length=255,
        db_column="adresse",
        null=True,
        blank=True
    )

    adresse2 = models.CharField(
        max_length=255,
        db_column="adresse2",
        null=True,
        blank=True
    )

    code_postal = models.CharField(
        max_length=255,
        db_column="code_postal",
        null=True,
        blank=True
    )

    ville = models.CharField(
        max_length=255,
        db_column="ville",
        null=True,
        blank=True
    )

    boite_postale = models.CharField(
        max_length=255,
        db_column="boite_postale",
        null=True,
        blank=True
    )

    is_livraison = models.BooleanField(
        db_column="isLivraison",
        null=True,
        blank=True
    )

    longitude = models.CharField(
        max_length=255,
        db_column="longitude",
        null=True,
        blank=True
    )

    latitude = models.CharField(
        max_length=255,
        db_column="latitude",
        null=True,
        blank=True
    )

    # -----------------------------
    # Métier / gestion
    # -----------------------------
    date_creation = models.DateTimeField(
        db_column="dateCreation",
        null=True,
        blank=True
    )

    date_modification = models.DateTimeField(
        db_column="dateModification",
        null=True,
        blank=True
    )

    nb_affaire = models.IntegerField(
        db_column="nbAffaire",
        null=True,
        blank=True
    )

    ca = models.FloatField(
        db_column="ca",
        null=True,
        blank=True
    )

    marge = models.FloatField(
        db_column="marge",
        null=True,
        blank=True
    )

    id_client = models.CharField(
        max_length=255,
        db_column="idClient",
        null=True,
        blank=True
    )

    id_wp = models.IntegerField(
        db_column="idWp",
        null=True,
        blank=True
    )

    primaryutilisateur = models.IntegerField(
        db_column="primaryutilisateur",
        null=True,
        blank=True
    )

    archive = models.BooleanField(
        db_column="archive",
        null=True,
        blank=True
    )

    # -----------------------------
    # Divers / technique
    # -----------------------------
    numero = models.TextField(
        db_column="numero",
        null=True,
        blank=True
    )

    file_name = models.CharField(
        max_length=255,
        db_column="fileName",
        null=True,
        blank=True
    )

    commentaire = models.TextField(
        db_column="commentaire",
        null=True,
        blank=True
    )

    order_list = models.CharField(
        max_length=55,
        db_column="orderList",
        null=True,
        blank=True
    )

    application_partage = models.TextField(
        db_column="applicationPartage",
        null=True,
        blank=True
    )

    last_intersoft_sync_date = models.DateTimeField(
        db_column="lastIntersoftSyncDate",
        null=True,
        blank=True
    )

    token = models.CharField(
        max_length=255,
        db_column="token",
        null=True,
        blank=True
    )

    is_compte_app = models.BooleanField(
        db_column="isCompteApp",
        null=True,
        blank=True
    )

    external_jira_webhook_url = models.CharField(
        max_length=255,
        db_column="externalJiraWebhookUrl",
        null=True,
        blank=True
    )

    annee_compte = models.CharField(
        max_length=255,
        db_column="anneeCompte",
        null=True,
        blank=True
    )

    # -----------------------------
    # Meta
    # -----------------------------
    class Meta:
        db_table = "Compte"
        managed = False
        indexes = [
            models.Index(fields=["application_id"]),
            models.Index(fields=["agence_id"]),
            models.Index(fields=["pays_id"]),
            models.Index(fields=["file_import_id"]),
            models.Index(fields=["opco_id"]),
            models.Index(fields=["numero_compte_id"]),
            models.Index(fields=["diplome_id"]),
        ]

    def __str__(self):
        return self.nom


class Affaire(models.Model):
    # -----------------------------
    # Relations (IDs uniquement)
    # -----------------------------
    compte_id = models.IntegerField(
        db_column="compte_id",
        null=True,
        blank=True
    )

    compte_opco_id = models.IntegerField(
        db_column="compteOpco_id",
        null=True,
        blank=True
    )

    compte_classe_id = models.IntegerField(
        db_column="compteClasse_id",
        null=True,
        blank=True
    )

    application_id = models.IntegerField(
        db_column="application_id",
        null=True,
        blank=True
    )

    banque_id = models.IntegerField(
        db_column="banque_id",
        null=True,
        blank=True
    )

    ca_commercial_id = models.IntegerField(
        db_column="caCommercial_id",
        null=True,
        blank=True
    )

    formation_of_id = models.IntegerField(
        db_column="formationOf_id",
        null=True,
        blank=True
    )

    file_import_id = models.IntegerField(
        db_column="fileImport_id",
        null=True,
        blank=True
    )

    affaire_parent_id = models.IntegerField(
        db_column="affaireParent_id",
        null=True,
        blank=True
    )

    # -----------------------------
    # Infos principales
    # -----------------------------
    nom = models.TextField(
        db_column="nom"
    )

    nom2 = models.CharField(
        max_length=255,
        db_column="nom2",
        null=True,
        blank=True
    )

    prestation = models.CharField(
        max_length=255,
        db_column="prestation",
        null=True,
        blank=True
    )

    code_affaire = models.CharField(
        max_length=255,
        db_column="codeAffaire",
        null=True,
        blank=True
    )

    statut = models.CharField(
        max_length=255,
        db_column="statut",
        null=True,
        blank=True
    )

    projet = models.CharField(
        max_length=255,
        db_column="projet",
        null=True,
        blank=True
    )

    paiement = models.CharField(
        max_length=255,
        db_column="paiement",
        null=True,
        blank=True
    )

    abonnement = models.CharField(
        max_length=255,
        db_column="abonnement",
        null=True,
        blank=True
    )

    activite_status = models.CharField(
        max_length=255,
        db_column="activiteStatus",
        default="active"
    )

    # -----------------------------
    # Dates
    # -----------------------------
    date_creation = models.DateTimeField(
        db_column="dateCreation",
        null=True,
        blank=True
    )

    date_modification = models.DateTimeField(
        db_column="dateModification",
        null=True,
        blank=True
    )

    date_devis = models.DateTimeField(
        db_column="dateDevis",
        null=True,
        blank=True
    )

    date_commande = models.DateTimeField(
        db_column="dateCommande",
        null=True,
        blank=True
    )

    date_facture = models.DateTimeField(
        db_column="dateFacture",
        null=True,
        blank=True
    )

    date_annule = models.DateTimeField(
        db_column="dateAnnule",
        null=True,
        blank=True
    )

    date_cloture = models.DateTimeField(
        db_column="dateCloture",
        null=True,
        blank=True
    )

    date_livraison = models.DateTimeField(
        db_column="dateLivraison",
        null=True,
        blank=True
    )

    date_paiement = models.DateTimeField(
        db_column="datePaiement",
        null=True,
        blank=True
    )

    date_parution = models.DateTimeField(
        db_column="dateParution",
        null=True,
        blank=True
    )

    # -----------------------------
    # Financier
    # -----------------------------
    ca = models.FloatField(
        db_column="ca",
        null=True,
        blank=True
    )

    cout = models.FloatField(
        db_column="cout",
        null=True,
        blank=True
    )

    marge = models.FloatField(
        db_column="marge",
        null=True,
        blank=True
    )

    tva = models.FloatField(
        db_column="tva",
        null=True,
        blank=True
    )

    remise = models.FloatField(
        db_column="remise",
        null=True,
        blank=True
    )

    remise_produit = models.FloatField(
        db_column="remiseProduit",
        null=True,
        blank=True
    )

    remise_pourcent = models.FloatField(
        db_column="remisePourcent",
        null=True,
        blank=True
    )

    download_offre = models.FloatField(
        db_column="downloadOffre",
        null=True,
        blank=True
    )

    # -----------------------------
    # États / flags
    # -----------------------------
    tacite_reco = models.BooleanField(
        db_column="taciteReco",
        null=True,
        blank=True
    )

    is_valide = models.BooleanField(
        db_column="isValide",
        null=True,
        blank=True
    )

    is_new = models.BooleanField(
        db_column="isNew",
        null=True,
        blank=True
    )

    litige = models.BooleanField(
        db_column="litige",
        null=True,
        blank=True
    )

    is_show_on_renta_client = models.BooleanField(
        db_column="isShowOnRentaClient",
        default=True
    )

    # -----------------------------
    # Divers
    # -----------------------------
    etat_devis = models.FloatField(
        db_column="etatDevis",
        null=True,
        blank=True
    )

    etat_commande = models.FloatField(
        db_column="etatCommande",
        null=True,
        blank=True
    )

    descriptif = models.TextField(
        db_column="descriptif",
        null=True,
        blank=True
    )

    commentaire = models.TextField(
        db_column="commentaire",
        null=True,
        blank=True
    )

    condition_texte = models.TextField(
        db_column="conditionTexte",
        null=True,
        blank=True
    )

    dates_de_recurrence = models.TextField(
        db_column="datesDeRecurrence",
        null=True,
        blank=True
    )

    id_affaire_import = models.CharField(
        max_length=255,
        db_column="idAffaireImport",
        null=True,
        blank=True
    )

    id_affaire_multiple = models.TextField(
        db_column="idAffaireMultiple",
        null=True,
        blank=True
    )

    position = models.IntegerField(
        db_column="position",
        null=True,
        blank=True
    )

    numero = models.CharField(
        max_length=255,
        db_column="numero",
        null=True,
        blank=True
    )

    devis_evol = models.CharField(
        max_length=55,
        db_column="devisEvol",
        null=True,
        blank=True
    )

    periodicite = models.CharField(
        max_length=255,
        db_column="periodicite",
        null=True,
        blank=True
    )

    nb_caractere_page1 = models.IntegerField(
        db_column="nbCaracterePage1",
        null=True,
        blank=True
    )

    nb_caractere_page2 = models.IntegerField(
        db_column="nbCaracterePage2",
        null=True,
        blank=True
    )

    nb_caractere_enlever = models.IntegerField(
        db_column="nbCaractereEnlever",
        null=True,
        blank=True
    )

    token = models.CharField(
        max_length=255,
        db_column="token",
        null=True,
        blank=True
    )

    lifecycle_callback_trigger = models.CharField(
        max_length=255,
        db_column="lifecycleCallbackTrigger",
        null=True,
        blank=True
    )

    id_post_wp = models.IntegerField(
        db_column="idPostWp",
        null=True,
        blank=True
    )

    # -----------------------------
    # Meta
    # -----------------------------
    class Meta:
        db_table = "Affaire"
        managed = False
        indexes = [
            models.Index(fields=["compte_id"]),
            models.Index(fields=["application_id"]),
            models.Index(fields=["file_import_id"]),
            models.Index(fields=["compte_opco_id"]),
            models.Index(fields=["compte_classe_id"]),
            models.Index(fields=["banque_id"]),
            models.Index(fields=["ca_commercial_id"]),
            models.Index(fields=["formation_of_id"]),
            models.Index(fields=["affaire_parent_id"]),
        ]

    def __str__(self):
        return self.nom
