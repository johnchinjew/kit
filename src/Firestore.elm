module Firestore exposing (deleteField, setDoc, value)

import Json.Encode as Encode


setDoc : { merge : Bool } -> Encode.Value -> Encode.Value
setDoc options patch =
    Encode.object
        [ ( "merge", Encode.bool options.merge )
        , ( "patch", patch )
        ]


value : Encode.Value -> Encode.Value
value data =
    Encode.object
        [ ( "$op", Encode.string "value" )
        , ( "value", data )
        ]


deleteField : Encode.Value
deleteField =
    Encode.object [ ( "$op", Encode.string "delete" ) ]
