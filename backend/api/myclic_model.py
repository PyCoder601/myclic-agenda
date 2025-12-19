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
